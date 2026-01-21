/**
 * WhatsApp Worker
 * 
 * Handles a single user's WhatsApp connection using whatsapp-web.js.
 * - Manages QR code generation
 * - Handles message events
 * - Maintains session state
 */

import { Client, LocalAuth, type Message } from 'whatsapp-web.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@parent-assistant/database';
import type { SessionStatus } from '@parent-assistant/shared';
import { MessageProcessor } from './message-processor.js';
import { getScheduler } from './scheduler.js';
import { CalendarService } from './calendar-service.js';

const HEARTBEAT_INTERVAL = 30 * 1000; // 30 seconds for better monitoring
const UNSTABLE_THRESHOLD = 2 * 60 * 1000; // 2 minutes without heartbeat
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY = 5000; // 5 seconds base delay

export class WhatsAppWorker {
  private userId: string;
  private supabase: SupabaseClient<Database>;
  private client: Client | null = null;
  private status: SessionStatus = 'disconnected';
  private lastHeartbeat: number | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private messageProcessor: MessageProcessor;
  private reconnectAttempts = 0;
  private isReconnecting = false;
  private workerId: string;

  constructor(userId: string, supabase: SupabaseClient<Database>) {
    this.userId = userId;
    this.supabase = supabase;
    this.messageProcessor = new MessageProcessor(supabase);
    // Generate unique worker ID for this instance
    this.workerId = `worker-${process.env.RENDER_INSTANCE_ID || process.pid}-${Date.now()}`;
  }

  async start(): Promise<void> {
    console.log(`[${this.userId}] Starting WhatsApp client...`);

    this.client = new Client({
      authStrategy: new LocalAuth({
        clientId: this.userId,
        dataPath: './sessions'
      }),
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
          '--disable-gpu',
          '--disable-software-rasterizer',
          '--disable-extensions',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-breakpad',
          '--disable-component-extensions-with-background-pages',
          '--disable-features=TranslateUI,BlinkGenPropertyTrees',
          '--disable-ipc-flooding-protection',
          '--disable-renderer-backgrounding',
          '--enable-features=NetworkService,NetworkServiceInProcess',
          '--force-color-profile=srgb',
          '--hide-scrollbars',
          '--metrics-recording-only',
          '--mute-audio',
          '--disable-crash-reporter',
          '--crash-dumps-dir=/tmp',
          '--disable-logging',
          '--log-level=3',
          '--user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        ],
        // Let Puppeteer use its bundled Chromium instead of forcing system Chromium
        // executablePath: undefined means use Puppeteer's downloaded Chromium
        ...(process.env.PUPPETEER_EXECUTABLE_PATH && { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH }),
        ignoreDefaultArgs: ['--disable-extensions']
      }
    });

    this.setupEventHandlers();

    await this.client.initialize();
  }

  private setupEventHandlers(): void {
    if (!this.client) return;

    // QR Code event
    this.client.on('qr', async (qr) => {
      console.log(`[${this.userId}] QR Code generated`);
      await this.updateSession('qr_required', qr);
    });

    // Ready event
    this.client.on('ready', async () => {
      console.log(`[${this.userId}] WhatsApp client ready`);
      await this.updateSession('connected');
      this.startHeartbeat();
      
      // Auto-sync groups on connection
      try {
        await this.syncGroups();
      } catch (error) {
        console.error(`[${this.userId}] Failed to sync groups:`, error);
      }
    });

    // Authentication success
    this.client.on('authenticated', () => {
      console.log(`[${this.userId}] Authenticated successfully`);
    });

    // Authentication failure
    this.client.on('auth_failure', async (message) => {
      console.error(`[${this.userId}] Authentication failed:`, message);
      await this.updateSession('manual_reauth_required', null, message);
      
      // Send notification to parent about auth failure
      await this.notifyDisconnection('נדרשת סריקת QR מחדש');
    });

    // Disconnected
    this.client.on('disconnected', async (reason) => {
      console.log(`[${this.userId}] Disconnected:`, reason);
      this.stopHeartbeat();
      await this.updateSession('disconnected', null, reason);
      
      // Send notification to parent about disconnection
      await this.notifyDisconnection(reason);
    });

    // Message received (private messages for calendar approvals)
    this.client.on('message', async (message) => {
      // Handle private messages (calendar approvals)
      if (!message.from.includes('@g.us')) {
        await this.handlePrivateMessage(message);
      } else {
        await this.handleMessage(message);
      }
    });

    // Group message received
    this.client.on('message_create', async (message) => {
      // Only process messages from groups
      if (message.from.includes('@g.us')) {
        await this.handleMessage(message);
      }
    });
  }

  /**
   * Handle private messages (for calendar approval responses)
   */
  private async handlePrivateMessage(message: Message): Promise<void> {
    try {
      // Extract phone number from message.from (format: 972XXXXXXXX@c.us)
      const phone = message.from.replace('@c.us', '');
      const content = message.body?.trim();

      if (!content) return;

      console.log(`[${this.userId}] Private message from ${phone}: ${content.substring(0, 30)}...`);

      // Check if this is a calendar approval response
      const scheduler = getScheduler();
      if (scheduler) {
        const calendarService = scheduler.getCalendarService();
        const result = await calendarService.processApprovalReply(phone, content);
        
        if (result.processed) {
          console.log(`[${this.userId}] Calendar approval processed: ${result.action}`);
          return;
        }
      }

      // Not a calendar response - could add other private message handling here
    } catch (error) {
      console.error(`[${this.userId}] Error handling private message:`, error);
    }
  }

  private async handleMessage(message: Message): Promise<void> {
    try {
      // Only process group messages
      if (!message.from.includes('@g.us')) return;

      console.log(`[${this.userId}] Message received from ${message.from}`);

      const chat = await message.getChat();
      const contact = await message.getContact();

      // Get the group for this user
      const { data: group } = await this.supabase
        .from('groups')
        .select('id, child_id')
        .eq('user_id', this.userId)
        .eq('wa_group_id', message.from)
        .eq('is_active', true)
        .single();

      if (!group) {
        // Group not registered or not active, skip
        console.log(`[${this.userId}] Group not active or not found: ${chat.name}`);
        return;
      }

      // Handle content - for media, describe what it is
      let content = message.body;
      if (message.hasMedia && !content) {
        // For images/videos without caption, note the media type
        const mediaTypes: Record<string, string> = {
          'image': '[תמונה]',
          'video': '[סרטון]',
          'audio': '[הודעה קולית]',
          'ptt': '[הודעה קולית]',
          'document': '[מסמך]',
          'sticker': '[מדבקה]'
        };
        content = mediaTypes[message.type] || `[מדיה: ${message.type}]`;
      }

      // Skip empty messages (no content and no media)
      if (!content || content.trim() === '') {
        console.log(`[${this.userId}] Skipping empty message`);
        return;
      }

      console.log(`[${this.userId}] Saving message from ${chat.name}: ${content.substring(0, 50)}...`);

      // Save raw message
      const { data: savedMessage, error } = await this.supabase
        .from('wa_raw_messages')
        .insert({
          group_id: group.id,
          wa_message_id: message.id._serialized,
          content: content,
          sender: message.author || message.from,
          sender_name: contact.pushname || contact.name || null,
          media_type: message.hasMedia ? message.type : null,
          received_at: new Date(message.timestamp * 1000).toISOString()
        })
        .select()
        .single();

      if (error) {
        console.error(`[${this.userId}] Failed to save message:`, error);
        return;
      }

      // Process message with AI
      if (savedMessage) {
        await this.messageProcessor.processMessage(savedMessage, group.child_id, chat.name);
      }
    } catch (error) {
      console.error(`[${this.userId}] Error handling message:`, error);
    }
  }

  private async updateSession(
    status: SessionStatus,
    qrCode?: string | null,
    errorMessage?: string | null
  ): Promise<void> {
    console.log(`[${this.userId}] Status change: ${this.status} -> ${status}`);
    this.status = status;

    const update: Record<string, unknown> = {
      status,
      last_heartbeat: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      worker_id: this.workerId
    };

    if (qrCode !== undefined) {
      update.qr_code = qrCode;
    }

    if (errorMessage !== undefined) {
      update.error_message = errorMessage;
    }

    // Clear QR code when connected
    if (status === 'connected') {
      update.qr_code = null;
      update.error_message = null;
      // Reset reconnect attempts on successful connection
      this.reconnectAttempts = 0;
    }

    await this.supabase
      .from('wa_sessions')
      .update(update)
      .eq('user_id', this.userId);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.heartbeatInterval = setInterval(async () => {
      this.lastHeartbeat = Date.now();
      
      await this.supabase
        .from('wa_sessions')
        .update({
          last_heartbeat: new Date().toISOString(),
          status: 'connected'
        })
        .eq('user_id', this.userId);
    }, HEARTBEAT_INTERVAL);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  async stop(): Promise<void> {
    console.log(`[${this.userId}] Stopping WhatsApp client...`);
    this.stopHeartbeat();

    if (this.client) {
      try {
        await this.client.destroy();
      } catch (error) {
        console.error(`[${this.userId}] Error destroying client:`, error);
      }
      this.client = null;
    }

    await this.updateSession('disconnected');
  }

  async reconnect(): Promise<void> {
    if (this.isReconnecting) {
      console.log(`[${this.userId}] Already reconnecting, skipping...`);
      return;
    }

    this.isReconnecting = true;
    this.reconnectAttempts++;

    if (this.reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
      console.log(`[${this.userId}] Max reconnect attempts reached, requiring manual reauth`);
      await this.updateSession('manual_reauth_required', null, 'Max reconnection attempts exceeded');
      await this.notifyDisconnection('נדרש חיבור מחדש - יותר מדי ניסיונות התחברות נכשלו');
      this.isReconnecting = false;
      return;
    }

    // Exponential backoff: 5s, 10s, 20s, 40s, 80s
    const delay = RECONNECT_BASE_DELAY * Math.pow(2, this.reconnectAttempts - 1);
    console.log(`[${this.userId}] Attempting reconnect (attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}) in ${delay/1000}s...`);

    await new Promise(resolve => setTimeout(resolve, delay));

    try {
      await this.stop();
      await this.start();
      // Reset attempts on successful reconnect
      this.reconnectAttempts = 0;
    } catch (error) {
      console.error(`[${this.userId}] Reconnect failed:`, error);
      // Will retry on next health check
    } finally {
      this.isReconnecting = false;
    }
  }

  /**
   * Reset reconnection counter (called on successful connection)
   */
  resetReconnectAttempts(): void {
    this.reconnectAttempts = 0;
  }

  getStatus(): SessionStatus {
    return this.status;
  }

  getLastHeartbeat(): number | null {
    return this.lastHeartbeat;
  }

  /**
   * Send notification to parent when WhatsApp disconnects
   */
  private async notifyDisconnection(reason: string): Promise<void> {
    try {
      // Get user's phone number
      const { data: user } = await this.supabase
        .from('users')
        .select('phone, wa_opt_in, full_name')
        .eq('id', this.userId)
        .single();

      if (!user?.phone || !user.wa_opt_in) {
        console.log(`[${this.userId}] No phone or opted out - skipping disconnect notification`);
        return;
      }

      // Get the scheduler's GreenAPI sender
      const scheduler = getScheduler();
      if (!scheduler) {
        console.log(`[${this.userId}] Scheduler not available for notification`);
        return;
      }

      const greenApiSender = scheduler.getGreenApiSender();
      
      const message = `שלום ${user.full_name || ''},

חיבור ה-WhatsApp שלך התנתק.

אני כרגע לא רואה הודעות חדשות מהקבוצות.

כדי להמשיך לקבל עדכונים, היכנס להגדרות וחבר מחדש.

סיבת הניתוק: ${reason || 'לא ידועה'}`;

      const messageId = await greenApiSender.sendMessage(user.phone, message);
      
      if (messageId) {
        console.log(`[${this.userId}] Disconnect notification sent`);
      } else {
        console.log(`[${this.userId}] Failed to send disconnect notification`);
      }
    } catch (error) {
      console.error(`[${this.userId}] Error sending disconnect notification:`, error);
    }
  }

  /**
   * Fetch all WhatsApp groups and save them to the database
   */
  async syncGroups(): Promise<{ id: string; name: string; participants: number }[]> {
    if (!this.client) {
      throw new Error('WhatsApp client not initialized');
    }

    console.log(`[${this.userId}] Syncing groups...`);

    const chats = await this.client.getChats();
    const groups = chats.filter(chat => chat.isGroup);

    const syncedGroups: { id: string; name: string; participants: number }[] = [];

    for (const group of groups) {
      // Check if group already exists
      const { data: existingGroup } = await this.supabase
        .from('groups')
        .select('id')
        .eq('user_id', this.userId)
        .eq('wa_group_id', group.id._serialized)
        .single();

      if (!existingGroup) {
        // Insert new group
        await this.supabase
          .from('groups')
          .insert({
            user_id: this.userId,
            wa_group_id: group.id._serialized,
            name: group.name,
            type: 'general',
            is_active: false // Not active until user assigns to a child
          });
      }

      syncedGroups.push({
        id: group.id._serialized,
        name: group.name,
        participants: (group as any).participants?.length || 0
      });
    }

    console.log(`[${this.userId}] Synced ${syncedGroups.length} groups`);
    return syncedGroups;
  }

  getClient(): Client | null {
    return this.client;
  }

  /**
   * Scan historical messages from a specific group
   */
  async scanGroupHistory(waGroupId: string, limit: number = 50): Promise<number> {
    if (!this.client) {
      throw new Error('WhatsApp client not initialized');
    }

    console.log(`[${this.userId}] Scanning history for group ${waGroupId}...`);

    try {
      const chat = await this.client.getChatById(waGroupId);
      
      if (!chat.isGroup) {
        console.log(`[${this.userId}] Not a group chat, skipping`);
        return 0;
      }

      // Mark chat as seen to trigger WhatsApp to load history
      console.log(`[${this.userId}] Loading chat history...`);
      try {
        await chat.sendSeen();
      } catch (e) {
        // Ignore errors from sendSeen - it's just to trigger loading
      }
      
      // Small delay to allow WhatsApp to load the chat
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Try to load earlier messages first (this forces WhatsApp to sync)
      console.log(`[${this.userId}] Loading earlier messages...`);
      try {
        const earlierMessages = await (chat as any).fetchEarlierMessages?.({ limit: 100 });
        if (earlierMessages) {
          console.log(`[${this.userId}] Loaded ${earlierMessages.length} earlier messages`);
        }
      } catch (e) {
        console.log(`[${this.userId}] fetchEarlierMessages not available, trying alternative...`);
      }

      await new Promise(resolve => setTimeout(resolve, 2000));

      // Fetch recent messages
      let messages = await chat.fetchMessages({ limit });
      console.log(`[${this.userId}] Fetched ${messages.length} messages from WhatsApp`);
      
      // If we got very few messages, log more details about the chat
      if (messages.length < 5) {
        console.log(`[${this.userId}] Few messages found. Chat details:`);
        console.log(`[${this.userId}]   - Name: ${chat.name}`);
        console.log(`[${this.userId}]   - isGroup: ${chat.isGroup}`);
        console.log(`[${this.userId}]   - isReadOnly: ${(chat as any).isReadOnly}`);
        console.log(`[${this.userId}]   - isMuted: ${(chat as any).isMuted}`);
        console.log(`[${this.userId}]   - unreadCount: ${chat.unreadCount}`);
        
        // Try with higher limit
        console.log(`[${this.userId}] Trying with higher limit...`);
        messages = await chat.fetchMessages({ limit: 200 });
        console.log(`[${this.userId}] Second attempt: ${messages.length} messages`);
      }
      
      // Get group from database
      const { data: group } = await this.supabase
        .from('groups')
        .select('id, child_id')
        .eq('user_id', this.userId)
        .eq('wa_group_id', waGroupId)
        .single();

      if (!group) {
        console.log(`[${this.userId}] Group not found in database`);
        return 0;
      }

      let processedCount = 0;
      let skippedFromMe = 0;
      let skippedExisting = 0;
      let mediaCount = 0;

      for (const message of messages) {
        // Debug log for each message
        console.log(`[${this.userId}] Message: type=${message.type}, hasMedia=${message.hasMedia}, body=${message.body?.substring(0, 30) || 'EMPTY'}, fromMe=${message.fromMe}`);
        
        // Skip messages from self
        if (message.fromMe) {
          skippedFromMe++;
          continue;
        }

        // Check if message already exists FOR THIS GROUP
        const { data: existing } = await this.supabase
          .from('wa_raw_messages')
          .select('id')
          .eq('group_id', group.id)
          .eq('wa_message_id', message.id._serialized)
          .single();

        if (existing) {
          skippedExisting++;
          continue; // Already processed
        }

        // Handle content - use body, caption for media, or placeholder
        let content = message.body;
        if (!content && message.hasMedia) {
          // Try to get caption from media message
          const mediaType = message.type;
          const caption = (message as any)._data?.caption || '';
          if (caption) {
            content = caption;
          } else {
            // Use placeholder based on media type
            const mediaLabels: Record<string, string> = {
              'image': '[תמונה]',
              'video': '[סרטון]',
              'audio': '[הודעה קולית]',
              'document': '[מסמך]',
              'sticker': '[מדבקה]'
            };
            content = mediaLabels[mediaType] || `[מדיה: ${mediaType}]`;
          }
          mediaCount++;
        }

        // Skip if still no content
        if (!content) continue;

        try {
          const contact = await message.getContact();

          // Save raw message
          const { data: savedMessage } = await this.supabase
            .from('wa_raw_messages')
            .insert({
              group_id: group.id,
              wa_message_id: message.id._serialized,
              content: content,
              sender: message.author || message.from,
              sender_name: contact.pushname || contact.name || null,
              media_type: message.hasMedia ? message.type : null,
              received_at: new Date(message.timestamp * 1000).toISOString()
            })
            .select()
            .single();

          // Process message with AI
          if (savedMessage) {
            await this.messageProcessor.processMessage(savedMessage, group.child_id, chat.name);
            processedCount++;
          }
        } catch (error) {
          console.error(`[${this.userId}] Error processing message:`, error);
        }
      }

      console.log(`[${this.userId}] Scan complete: processed=${processedCount}, media=${mediaCount}, skippedFromMe=${skippedFromMe}, skippedExisting=${skippedExisting}`);
      return processedCount;
    } catch (error) {
      console.error(`[${this.userId}] Error scanning group history:`, error);
      throw error;
    }
  }
}

