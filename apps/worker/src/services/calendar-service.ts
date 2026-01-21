import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface CalendarConnection {
  id: string;
  user_id: string;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
  calendar_id: string;
}

interface PendingApproval {
  id: string;
  user_id: string;
  phone: string;
  event_summary: string;
  event_description: string | null;
  event_start: string;
  event_end: string;
  event_location: string | null;
  status: string;
}

interface ExtractedEvent {
  summary: string;
  description?: string;
  start: Date;
  end: Date;
  location?: string;
  messageId: string;
}

export class CalendarService {
  private greenApiSender: any;

  constructor(greenApiSender: any) {
    this.greenApiSender = greenApiSender;
  }

  /**
   * Refresh Google access token if expired
   */
  async refreshTokenIfNeeded(connection: CalendarConnection): Promise<string> {
    if (!connection.token_expires_at) {
      return connection.access_token;
    }

    const expiresAt = new Date(connection.token_expires_at);
    const now = new Date();
    
    // Refresh if token expires in less than 5 minutes
    if (expiresAt.getTime() - now.getTime() > 5 * 60 * 1000) {
      return connection.access_token;
    }

    if (!connection.refresh_token) {
      console.error('[Calendar] No refresh token available');
      return connection.access_token;
    }

    try {
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_SECRET_ID!,
          refresh_token: connection.refresh_token,
          grant_type: 'refresh_token',
        }),
      });

      const tokens = await response.json();

      if (!response.ok) {
        console.error('[Calendar] Token refresh failed:', tokens);
        return connection.access_token;
      }

      // Update token in database
      const newExpiresAt = new Date();
      newExpiresAt.setSeconds(newExpiresAt.getSeconds() + tokens.expires_in);

      await supabase
        .from('calendar_connections')
        .update({
          access_token: tokens.access_token,
          token_expires_at: newExpiresAt.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', connection.id);

      return tokens.access_token;
    } catch (error) {
      console.error('[Calendar] Error refreshing token:', error);
      return connection.access_token;
    }
  }

  /**
   * Get calendar connection for a user
   */
  async getConnection(userId: string): Promise<CalendarConnection | null> {
    const { data, error } = await supabase
      .from('calendar_connections')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', 'google')
      .eq('is_active', true)
      .single();

    if (error || !data) {
      return null;
    }

    return data as CalendarConnection;
  }

  /**
   * Send approval request via WhatsApp
   */
  async sendApprovalRequest(
    userId: string,
    phone: string,
    event: ExtractedEvent
  ): Promise<string | null> {
    const startDate = new Date(event.start);
    const dateStr = startDate.toLocaleDateString('he-IL', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
    const timeStr = startDate.toLocaleTimeString('he-IL', {
      hour: '2-digit',
      minute: '2-digit',
    });

    const message = `זוהה אירוע חדש:
*${event.summary}*
תאריך: ${dateStr}
שעה: ${timeStr}
${event.location ? `מיקום: ${event.location}` : ''}

להוסיף ליומן Google?
השב *כן* להוספה או *לא* לביטול`;

    try {
      // Send WhatsApp message
      const messageId = await this.greenApiSender.sendMessage(phone, message);

      // Save pending approval
      const { data, error } = await supabase
        .from('pending_approvals')
        .insert({
          user_id: userId,
          phone,
          event_summary: event.summary,
          event_description: event.description,
          event_start: event.start.toISOString(),
          event_end: event.end.toISOString(),
          event_location: event.location,
          original_message_id: event.messageId,
          whatsapp_message_id: messageId,
          status: 'pending',
        })
        .select()
        .single();

      if (error) {
        console.error('[Calendar] Error saving pending approval:', error);
        return null;
      }

      console.log(`[Calendar] Sent approval request for "${event.summary}" to ${phone}`);
      return data.id;
    } catch (error) {
      console.error('[Calendar] Error sending approval request:', error);
      return null;
    }
  }

  /**
   * Process a WhatsApp reply for calendar approval
   */
  async processApprovalReply(
    phone: string,
    messageText: string
  ): Promise<{ processed: boolean; action?: string }> {
    const normalizedText = messageText.trim().toLowerCase();
    const isApproval = ['כן', 'yes', '1', 'אישור', 'להוסיף'].some(word => 
      normalizedText.includes(word)
    );
    const isRejection = ['לא', 'no', '0', 'ביטול', 'לבטל'].some(word => 
      normalizedText.includes(word)
    );

    if (!isApproval && !isRejection) {
      return { processed: false };
    }

    // Find pending approval for this phone
    const { data: pendingApprovals, error } = await supabase
      .from('pending_approvals')
      .select('*')
      .eq('phone', phone)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1);

    if (error || !pendingApprovals || pendingApprovals.length === 0) {
      return { processed: false };
    }

    const approval = pendingApprovals[0] as PendingApproval;

    if (isApproval) {
      // Add to Google Calendar
      const success = await this.addEventToCalendar(approval);
      
      // Update status
      await supabase
        .from('pending_approvals')
        .update({ status: success ? 'approved' : 'failed' })
        .eq('id', approval.id);

      if (success) {
        await this.greenApiSender.sendMessage(
          phone,
          `האירוע "${approval.event_summary}" נוסף ליומן בהצלחה!`
        );
      } else {
        await this.greenApiSender.sendMessage(
          phone,
          `שגיאה בהוספת האירוע ליומן. אנא נסה שוב מאוחר יותר.`
        );
      }

      return { processed: true, action: 'approved' };
    } else {
      // Reject
      await supabase
        .from('pending_approvals')
        .update({ status: 'rejected' })
        .eq('id', approval.id);

      await this.greenApiSender.sendMessage(
        phone,
        `האירוע "${approval.event_summary}" לא נוסף ליומן.`
      );

      return { processed: true, action: 'rejected' };
    }
  }

  /**
   * Add event to Google Calendar
   */
  async addEventToCalendar(approval: PendingApproval): Promise<boolean> {
    const connection = await this.getConnection(approval.user_id);
    if (!connection) {
      console.error('[Calendar] No calendar connection for user:', approval.user_id);
      return false;
    }

    try {
      const accessToken = await this.refreshTokenIfNeeded(connection);

      const event = {
        summary: approval.event_summary,
        description: approval.event_description,
        start: {
          dateTime: approval.event_start,
          timeZone: 'Asia/Jerusalem',
        },
        end: {
          dateTime: approval.event_end,
          timeZone: 'Asia/Jerusalem',
        },
        location: approval.event_location,
      };

      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${connection.calendar_id}/events`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(event),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        console.error('[Calendar] Failed to create event:', result);
        return false;
      }

      // Save to calendar_events table
      await supabase.from('calendar_events').insert({
        user_id: approval.user_id,
        google_event_id: result.id,
        summary: approval.event_summary,
        start_time: approval.event_start,
        end_time: approval.event_end,
        location: approval.event_location,
      });

      console.log(`[Calendar] Event "${approval.event_summary}" added to calendar`);
      return true;
    } catch (error) {
      console.error('[Calendar] Error adding event to calendar:', error);
      return false;
    }
  }

  /**
   * Extract events from extracted items and send approval requests
   */
  async processExtractedEvents(userId: string, phone: string): Promise<void> {
    // Check if user has calendar connected
    const connection = await this.getConnection(userId);
    if (!connection) {
      return;
    }

    // Get recent event items that haven't been processed
    const { data: items, error } = await supabase
      .from('extracted_items')
      .select(`
        id,
        summary,
        category,
        data,
        message_date,
        wa_raw_messages!inner(group_id, groups!inner(user_id))
      `)
      .eq('category', 'event')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false });

    if (error || !items) {
      return;
    }

    for (const item of items) {
      // Check if already sent approval for this item
      const { data: existing } = await supabase
        .from('pending_approvals')
        .select('id')
        .eq('original_message_id', item.id)
        .single();

      if (existing) {
        continue;
      }

      // Parse event data
      const eventData = item.data as any;
      if (!eventData?.date) {
        continue;
      }

      const startDate = new Date(eventData.date);
      if (isNaN(startDate.getTime())) {
        continue;
      }

      // Default to 1 hour event
      const endDate = new Date(startDate);
      endDate.setHours(endDate.getHours() + 1);

      const event: ExtractedEvent = {
        summary: item.summary,
        description: eventData.description,
        start: startDate,
        end: endDate,
        location: eventData.location,
        messageId: item.id,
      };

      await this.sendApprovalRequest(userId, phone, event);
    }
  }

  /**
   * Clean up expired pending approvals
   */
  async cleanupExpiredApprovals(): Promise<void> {
    await supabase
      .from('pending_approvals')
      .update({ status: 'expired' })
      .eq('status', 'pending')
      .lt('expires_at', new Date().toISOString());
  }

  /**
   * Process calendar events and send reminders
   * Called by scheduler every 10 minutes
   */
  async processCalendarEvents(): Promise<void> {
    console.log('[Calendar] Processing calendar events for reminders...');

    try {
      // Get all users with calendar connections
      const { data: connections, error: connError } = await supabase
        .from('calendar_connections')
        .select('user_id')
        .eq('is_active', true);

      if (connError || !connections) {
        console.error('[Calendar] Error getting connections:', connError);
        return;
      }

      for (const conn of connections) {
        await this.checkUserEventsForReminders(conn.user_id);
      }

      // Also check calendar_events table for local events
      await this.checkLocalEventsForReminders();

    } catch (error) {
      console.error('[Calendar] Error processing calendar events:', error);
    }
  }

  /**
   * Check user's Google Calendar events and send reminders
   */
  private async checkUserEventsForReminders(userId: string): Promise<void> {
    const connection = await this.getConnection(userId);
    if (!connection) return;

    try {
      const accessToken = await this.refreshTokenIfNeeded(connection);

      // Get events for the next 24 hours
      const now = new Date();
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${connection.calendar_id}/events?` +
        `timeMin=${now.toISOString()}&timeMax=${tomorrow.toISOString()}&singleEvents=true&orderBy=startTime`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        console.error('[Calendar] Failed to fetch events for user:', userId);
        return;
      }

      const data = await response.json();
      const events = data.items || [];

      // Get user's phone
      const { data: user } = await supabase
        .from('users')
        .select('phone')
        .eq('id', userId)
        .single();

      if (!user?.phone) return;

      for (const event of events) {
        await this.checkAndSendReminder(userId, user.phone, event);
      }
    } catch (error) {
      console.error('[Calendar] Error checking user events:', error);
    }
  }

  /**
   * Check local calendar_events table for reminders
   */
  private async checkLocalEventsForReminders(): Promise<void> {
    const now = new Date();
    const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    // Get events starting in the next 2 hours that haven't had reminders sent
    const { data: events, error } = await supabase
      .from('calendar_events')
      .select('*, users:user_id(id)')
      .eq('reminder_sent', false)
      .gte('start_time', now.toISOString())
      .lte('start_time', twoHoursFromNow.toISOString());

    if (error || !events) {
      return;
    }

    for (const event of events) {
      // Get user's phone
      const { data: user } = await supabase
        .from('users')
        .select('phone')
        .eq('id', event.user_id)
        .single();

      if (!user?.phone) continue;

      await this.sendEventReminder(event.user_id, user.phone, {
        id: event.google_event_id,
        summary: event.summary,
        start: { dateTime: event.start_time },
        location: event.location,
      });

      // Mark reminder as sent
      await supabase
        .from('calendar_events')
        .update({ 
          reminder_sent: true,
          reminder_sent_at: new Date().toISOString()
        })
        .eq('id', event.id);
    }
  }

  /**
   * Check if reminder should be sent for an event
   */
  private async checkAndSendReminder(
    userId: string,
    phone: string,
    event: any
  ): Promise<void> {
    if (!event.start?.dateTime) return;

    const startTime = new Date(event.start.dateTime);
    const now = new Date();
    const minutesUntilEvent = (startTime.getTime() - now.getTime()) / (1000 * 60);

    // Send reminder 2 hours before (between 115-125 minutes, accounting for 10-min cron)
    // Or 30 minutes before (between 25-35 minutes)
    const shouldRemind2Hours = minutesUntilEvent >= 115 && minutesUntilEvent <= 125;
    const shouldRemind30Min = minutesUntilEvent >= 25 && minutesUntilEvent <= 35;

    if (!shouldRemind2Hours && !shouldRemind30Min) return;

    // Check if we already sent a reminder for this event at this time
    const reminderKey = `${event.id}_${shouldRemind2Hours ? '2h' : '30m'}`;
    const { data: existingReminder } = await supabase
      .from('calendar_events')
      .select('id')
      .eq('google_event_id', event.id)
      .eq('user_id', userId)
      .single();

    if (existingReminder) {
      // Check if this specific reminder was already sent (stored in reminder_sent_at as JSON or separate field)
      // For simplicity, we'll use the reminder_sent flag
      const { data: sentReminder } = await supabase
        .from('calendar_events')
        .select('reminder_sent')
        .eq('id', existingReminder.id)
        .single();

      if (sentReminder?.reminder_sent) return;
    }

    await this.sendEventReminder(userId, phone, event);

    // Update or create calendar_events entry
    if (existingReminder) {
      await supabase
        .from('calendar_events')
        .update({ 
          reminder_sent: true,
          reminder_sent_at: new Date().toISOString()
        })
        .eq('id', existingReminder.id);
    } else {
      await supabase
        .from('calendar_events')
        .upsert({
          user_id: userId,
          google_event_id: event.id,
          summary: event.summary,
          start_time: event.start.dateTime,
          end_time: event.end?.dateTime || event.start.dateTime,
          location: event.location,
          reminder_sent: true,
          reminder_sent_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,google_event_id'
        });
    }
  }

  /**
   * Send WhatsApp reminder for an event
   */
  private async sendEventReminder(
    userId: string,
    phone: string,
    event: any
  ): Promise<void> {
    const startTime = new Date(event.start.dateTime || event.start.date);
    const now = new Date();
    const minutesUntilEvent = Math.round((startTime.getTime() - now.getTime()) / (1000 * 60));

    let timeText = '';
    if (minutesUntilEvent > 60) {
      const hours = Math.floor(minutesUntilEvent / 60);
      timeText = `בעוד ${hours} ${hours === 1 ? 'שעה' : 'שעות'}`;
    } else {
      timeText = `בעוד ${minutesUntilEvent} דקות`;
    }

    const timeStr = startTime.toLocaleTimeString('he-IL', {
      hour: '2-digit',
      minute: '2-digit'
    });

    const message = `תזכורת!\n\n` +
      `*${event.summary}*\n` +
      `${timeText} (${timeStr})\n` +
      (event.location ? `מיקום: ${event.location}` : '');

    try {
      await this.greenApiSender.sendMessageToUser(userId, message);
      console.log(`[Calendar] Sent reminder for "${event.summary}" to user ${userId}`);
    } catch (error) {
      console.error('[Calendar] Error sending reminder:', error);
    }
  }
}

