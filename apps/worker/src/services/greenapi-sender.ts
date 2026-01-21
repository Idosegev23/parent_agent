/**
 * GreenAPI Sender Service
 * 
 * Handles sending WhatsApp messages to parents via GreenAPI.
 * Used for daily digests and immediate alerts.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables } from '@parent-assistant/database';
import { isShabbatOrHoliday, getNextMotzaeiShabbat, formatHebrewDate } from '../utils/hebrew-calendar.js';

const GREENAPI_URL = 'https://api.green-api.com';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

interface GreenAPIConfig {
  instanceId: string;
  apiToken: string;
}

export class GreenAPISender {
  private supabase: SupabaseClient<Database>;
  private config: GreenAPIConfig | null = null;

  constructor(supabase: SupabaseClient<Database>) {
    this.supabase = supabase;
    this.loadConfig();
  }

  private loadConfig(): void {
    const instanceId = process.env.GREENAPI_INSTANCE_ID;
    const apiToken = process.env.GREENAPI_API_TOKEN;

    if (instanceId && apiToken) {
      this.config = { instanceId, apiToken };
      console.log('[GreenAPI] Configuration loaded');
    } else {
      console.warn('[GreenAPI] Missing configuration - messages will be queued but not sent');
    }
  }

  /**
   * Send a WhatsApp message via GreenAPI
   * Returns the message ID on success, null on failure
   */
  async sendMessage(phone: string, message: string): Promise<string | null> {
    if (!this.config) {
      console.warn('[GreenAPI] Not configured, skipping send');
      return null;
    }

    // Format phone number (remove +, ensure starts with country code)
    const formattedPhone = this.formatPhoneNumber(phone);
    if (!formattedPhone) {
      console.error('[GreenAPI] Invalid phone number:', phone);
      return null;
    }

    const url = `${GREENAPI_URL}/waInstance${this.config.instanceId}/sendMessage/${this.config.apiToken}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          chatId: `${formattedPhone}@c.us`,
          message: message
        })
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('[GreenAPI] Send failed:', error);
        return null;
      }

      const result = await response.json();
      console.log('[GreenAPI] Message sent:', result.idMessage);
      return result.idMessage || 'sent';
    } catch (error) {
      console.error('[GreenAPI] Error sending message:', error);
      return null;
    }
  }

  /**
   * Send a WhatsApp message to a user by userId
   * Looks up the user's phone from wa_sessions
   */
  async sendMessageToUser(userId: string, message: string): Promise<string | null> {
    try {
      const { data: session } = await this.supabase
        .from('wa_sessions')
        .select('phone')
        .eq('user_id', userId)
        .single();

      if (!session?.phone) {
        console.warn('[GreenAPI] No phone found for user:', userId);
        return null;
      }

      return await this.sendMessage(session.phone, message);
    } catch (error) {
      console.error('[GreenAPI] Error sending message to user:', error);
      return null;
    }
  }

  /**
   * Format phone number for WhatsApp
   */
  private formatPhoneNumber(phone: string): string | null {
    // Remove all non-digits
    let digits = phone.replace(/\D/g, '');

    // Handle Israeli numbers
    if (digits.startsWith('0')) {
      // Israeli local format (05X...)
      digits = '972' + digits.substring(1);
    } else if (!digits.startsWith('972') && digits.length === 9) {
      // Assume Israeli without leading 0
      digits = '972' + digits;
    }

    // Validate length (should be 12 for Israeli numbers: 972 + 9 digits)
    if (digits.length < 10 || digits.length > 15) {
      return null;
    }

    return digits;
  }

  /**
   * Send a daily digest to a user
   */
  async sendDailyDigest(userId: string): Promise<boolean> {
    console.log(`[GreenAPI] Preparing daily digest for user ${userId}`);

    // Check if it's Shabbat/holiday - queue for later
    if (isShabbatOrHoliday()) {
      console.log('[GreenAPI] Shabbat/holiday - queueing digest');
      const content = await this.generateDigestContent(userId);
      if (content) {
        await this.queueMessage(userId, 'digest', content);
      }
      return true;
    }

    // Get user details
    const { data: user } = await this.supabase
      .from('users')
      .select('full_name, phone, wa_opt_in')
      .eq('id', userId)
      .single();

    if (!user?.phone || !user.wa_opt_in) {
      console.log(`[GreenAPI] User ${userId} has no phone or opted out`);
      return false;
    }

    // Generate digest content
    const content = await this.generateDigestContent(userId);
    if (!content) {
      console.log(`[GreenAPI] No content to send for user ${userId}`);
      return true; // Not an error, just nothing to send
    }

    // Try to send with retries
    return this.sendWithRetry(userId, user.phone, content, 'digest');
  }

  /**
   * Generate digest content for a user
   */
  private async generateDigestContent(userId: string): Promise<string | null> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get user's groups first
    const { data: userGroups } = await this.supabase
      .from('groups')
      .select('id')
      .eq('user_id', userId);

    if (!userGroups || userGroups.length === 0) {
      return null;
    }

    const groupIds = userGroups.map(g => g.id);

    // Get today's extracted items for this user's groups
    const { data: items } = await this.supabase
      .from('extracted_items')
      .select('id, category, urgency, action_required, summary, child_id, created_at')
      .gte('created_at', today.toISOString())
      .order('urgency', { ascending: false });

    if (!items || items.length === 0) {
      return null;
    }

    // Get children
    const { data: children } = await this.supabase
      .from('children')
      .select('id, name')
      .eq('user_id', userId);

    const childMap = new Map(children?.map(c => [c.id, c.name]) || []);

    // Get user name
    const { data: user } = await this.supabase
      .from('users')
      .select('full_name')
      .eq('id', userId)
      .single();

    // Format message
    return this.formatDigestMessage(user?.full_name || '', items, childMap);
  }

  /**
   * Format the daily digest message
   */
  private formatDigestMessage(
    userName: string,
    items: any[],
    childMap: Map<string, string>
  ): string {
    const dateStr = formatHebrewDate();
    
    let message = `שלום ${userName || ''},\n\n`;
    message += `סיכום יומי - ${dateStr}:\n\n`;

    // Group items by child
    const itemsByChild = new Map<string | null, any[]>();
    for (const item of items) {
      const childId = item.child_id;
      if (!itemsByChild.has(childId)) {
        itemsByChild.set(childId, []);
      }
      itemsByChild.get(childId)!.push(item);
    }

    // Format items by child
    for (const [childId, childItems] of itemsByChild) {
      const childName = childId ? childMap.get(childId) || 'לא משויך' : 'כללי';
      message += `${childName}:\n`;
      
      for (const item of childItems) {
        const urgencyMarker = item.urgency >= 7 ? '!' : '*';
        message += `${urgencyMarker} ${item.summary}\n`;
      }
      message += '\n';
    }

    // Add action items
    const actionItems = items.filter(i => i.action_required);
    if (actionItems.length > 0) {
      message += `לביצוע:\n`;
      actionItems.forEach((item, idx) => {
        message += `${idx + 1}. ${item.summary}\n`;
      });
      message += '\n';
    }

    message += 'יום טוב!';

    return message;
  }

  /**
   * Send an immediate alert for an urgent item
   */
  async sendImmediateAlert(
    userId: string,
    item: Tables<'extracted_items'>,
    childName: string | null,
    groupName: string
  ): Promise<boolean> {
    console.log(`[GreenAPI] Sending immediate alert for user ${userId}`);

    // Check if it's Shabbat/holiday - queue for later
    if (isShabbatOrHoliday()) {
      console.log('[GreenAPI] Shabbat/holiday - queueing alert');
      const content = this.formatAlertMessage(item, childName, groupName);
      await this.queueMessage(userId, 'alert', content, item.id);
      return true;
    }

    // Get user details
    const { data: user } = await this.supabase
      .from('users')
      .select('phone, wa_opt_in')
      .eq('id', userId)
      .single();

    if (!user?.phone || !user.wa_opt_in) {
      console.log(`[GreenAPI] User ${userId} has no phone or opted out`);
      return false;
    }

    const content = this.formatAlertMessage(item, childName, groupName);
    return this.sendWithRetry(userId, user.phone, content, 'alert', item.id);
  }

  /**
   * Format an immediate alert message
   */
  private formatAlertMessage(
    item: Tables<'extracted_items'>,
    childName: string | null,
    groupName: string
  ): string {
    let message = '';
    
    if (childName) {
      message += `${childName} - התראה:\n\n`;
    } else {
      message += `התראה:\n\n`;
    }

    message += `${item.summary}\n`;
    message += `מקור: ${groupName}\n`;

    if (item.action_required) {
      message += `\nנדרשת פעולה!`;
    }

    return message;
  }

  /**
   * Send message with retry logic
   */
  private async sendWithRetry(
    userId: string,
    phone: string,
    content: string,
    messageType: 'digest' | 'alert',
    relatedItemId?: string
  ): Promise<boolean> {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      console.log(`[GreenAPI] Send attempt ${attempt}/${MAX_RETRIES}`);
      
      const messageId = await this.sendMessage(phone, content);
      
      if (messageId) {
        // Log success
        await this.logMessageSent(userId, messageType, content, relatedItemId);
        return true;
      }

      if (attempt < MAX_RETRIES) {
        await this.delay(RETRY_DELAY_MS * attempt);
      }
    }

    // All retries failed - queue for later and notify in web
    console.error(`[GreenAPI] All retries failed for user ${userId}`);
    await this.queueMessage(userId, messageType, content, relatedItemId, 'failed');
    await this.createWebNotification(userId, 'שליחת הודעה נכשלה - יש לבדוק בממשק');
    
    return false;
  }

  /**
   * Queue a message for later sending
   */
  private async queueMessage(
    userId: string,
    messageType: 'digest' | 'alert',
    content: string,
    relatedItemId?: string,
    status: string = 'pending'
  ): Promise<void> {
    const scheduledFor = isShabbatOrHoliday() 
      ? getNextMotzaeiShabbat()
      : new Date();

    await this.supabase.from('message_queue').insert({
      user_id: userId,
      message_type: messageType,
      content,
      scheduled_for: scheduledFor.toISOString(),
      status,
      related_item_id: relatedItemId || null
    });
  }

  /**
   * Log a successfully sent message
   */
  private async logMessageSent(
    userId: string,
    messageType: 'digest' | 'alert',
    content: string,
    relatedItemId?: string
  ): Promise<void> {
    await this.supabase.from('message_queue').insert({
      user_id: userId,
      message_type: messageType,
      content,
      scheduled_for: new Date().toISOString(),
      status: 'sent',
      sent_at: new Date().toISOString(),
      related_item_id: relatedItemId || null
    });
  }

  /**
   * Create a notification in the web interface
   */
  private async createWebNotification(userId: string, message: string): Promise<void> {
    await this.supabase.from('alerts').insert({
      user_id: userId,
      content: message,
      sent: false
    });
  }

  /**
   * Process queued messages (called from scheduler)
   */
  async processQueue(): Promise<number> {
    // Don't process during Shabbat
    if (isShabbatOrHoliday()) {
      console.log('[GreenAPI] Shabbat/holiday - skipping queue processing');
      return 0;
    }

    const now = new Date();

    // Get pending messages that should be sent now
    const { data: pending } = await this.supabase
      .from('message_queue')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_for', now.toISOString())
      .limit(50);

    if (!pending || pending.length === 0) {
      return 0;
    }

    console.log(`[GreenAPI] Processing ${pending.length} queued messages`);
    let sent = 0;

    for (const msg of pending) {
      // Get user phone
      const { data: user } = await this.supabase
        .from('users')
        .select('phone, wa_opt_in')
        .eq('id', msg.user_id)
        .single();

      if (!user?.phone || !user.wa_opt_in) {
        await this.supabase
          .from('message_queue')
          .update({ status: 'failed', error_message: 'No phone or opted out' })
          .eq('id', msg.id);
        continue;
      }

      // Update to sending
      await this.supabase
        .from('message_queue')
        .update({ status: 'sending' })
        .eq('id', msg.id);

      // Try to send
      const messageId = await this.sendMessage(user.phone, msg.content);

      if (messageId) {
        await this.supabase
          .from('message_queue')
          .update({ status: 'sent', sent_at: new Date().toISOString() })
          .eq('id', msg.id);
        sent++;
      } else {
        const retryCount = (msg.retry_count || 0) + 1;
        
        if (retryCount >= MAX_RETRIES) {
          await this.supabase
            .from('message_queue')
            .update({ 
              status: 'failed', 
              retry_count: retryCount,
              error_message: 'Max retries exceeded'
            })
            .eq('id', msg.id);
          
          await this.createWebNotification(msg.user_id, 'שליחת הודעה נכשלה');
        } else {
          // Schedule retry
          const nextRetry = new Date(Date.now() + RETRY_DELAY_MS * retryCount);
          await this.supabase
            .from('message_queue')
            .update({ 
              status: 'pending', 
              retry_count: retryCount,
              scheduled_for: nextRetry.toISOString()
            })
            .eq('id', msg.id);
        }
      }
    }

    console.log(`[GreenAPI] Sent ${sent}/${pending.length} queued messages`);
    return sent;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

