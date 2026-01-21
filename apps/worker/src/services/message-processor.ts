/**
 * Message Processor
 * 
 * Uses OpenAI GPT-5.2 Responses API to classify and extract
 * important information from WhatsApp messages.
 */

import OpenAI from 'openai';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables } from '@parent-assistant/database';
import type { MessageClassification } from '@parent-assistant/shared';
import { getScheduler } from './scheduler.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const MODEL = 'gpt-5.2';

// Threshold for immediate alerts (6 and above)
const IMMEDIATE_ALERT_THRESHOLD = 6;

export class MessageProcessor {
  private supabase: SupabaseClient<Database>;

  constructor(supabase: SupabaseClient<Database>) {
    this.supabase = supabase;
  }

  async processMessage(
    message: Tables<'wa_raw_messages'>,
    childId: string | null,
    groupName: string
  ): Promise<void> {
    try {
      // Skip very short messages or messages that are likely just reactions
      if (message.content.length < 5) {
        await this.markProcessed(message.id);
        return;
      }

      // Get the original message date
      const messageDate = message.received_at ? new Date(message.received_at) : new Date();
      
      // Classify the message using GPT-5.2
      const classification = await this.classifyMessage(message.content, groupName, messageDate);

      // Skip noise
      if (classification.category === 'noise' && classification.urgency < 3) {
        await this.markProcessed(message.id);
        return;
      }

      // Save extracted item with original message date and sender info
      const { data: savedItem } = await this.supabase.from('extracted_items').insert({
        message_id: message.id,
        child_id: childId,
        category: classification.category,
        urgency: classification.urgency,
        action_required: classification.action_required,
        summary: classification.summary,
        message_date: messageDate.toISOString(),
        data: {
          original_content: message.content.substring(0, 500), // Limit stored content
          child_relevant: classification.child_relevant,
          send_immediate_alert: classification.send_immediate_alert,
          sender_name: message.sender_name || null, // שם השולח
          sender_phone: message.sender || null // מספר טלפון השולח
        }
      }).select().single();

      // Check if immediate alert is needed (urgency >= 6)
      if (classification.send_immediate_alert && classification.urgency >= IMMEDIATE_ALERT_THRESHOLD) {
        await this.createAlert(message, classification);
        
        // Send via WhatsApp if scheduler is available
        if (savedItem) {
          await this.sendImmediateWhatsAppAlert(message, savedItem, childId, groupName);
        }
      }

      // Check if this is a schedule update that should update activities
      if ((classification.category === 'activity' || classification.category === 'schedule_change') && 
          this.isWeeklyScheduleMessage(message.content)) {
        await this.updateActivitySchedule(message, childId, groupName);
      }

      // Check for games/matches that should be added to calendar
      if (this.containsGameInfo(message.content)) {
        await this.createGameCalendarEvent(message, childId, groupName);
      }

      await this.markProcessed(message.id);
    } catch (error) {
      console.error('Error processing message:', error);
      // Don't mark as processed so it can be retried
    }
  }

  private async classifyMessage(
    content: string,
    groupContext: string,
    messageDate: Date
  ): Promise<MessageClassification> {
    const today = new Date();
    const daysDiff = Math.floor((today.getTime() - messageDate.getTime()) / (1000 * 60 * 60 * 24));
    const dateStr = messageDate.toLocaleDateString('he-IL', { 
      weekday: 'long', 
      day: 'numeric', 
      month: 'long' 
    });

    const response = await openai.responses.create({
      model: MODEL,
      instructions: `אתה מערכת AI שמסווגת הודעות מקבוצות WhatsApp של הורים בישראל.
הקבוצה: ${groupContext}
תאריך ההודעה: ${dateStr} (לפני ${daysDiff} ימים)
תאריך היום: ${today.toLocaleDateString('he-IL')}

שים לב: התחשב בתאריך ההודעה! הודעה מלפני שבוע פחות דחופה מהודעה מהיום.

המשימה שלך:
1. לסווג את ההודעה לקטגוריה המתאימה
2. לקבוע את רמת הדחיפות (0-10)
3. לזהות אם נדרשת פעולה מההורה
4. ליצור סיכום קצר בעברית
5. לקבוע אם לשלוח התראה מיידית

קטגוריות אפשריות:
- equipment: ציוד שצריך להביא (תיק, בגדים, ציוד לימודי)
- food: אוכל, ארוחות, אלרגיות
- event: אירועים מיוחדים (מסיבות, טיולים, הצגות)
- schedule_change: שינויים בלוח הזמנים
- parent_request: בקשות מההורים
- teacher_message: הודעות ממורה/גננת/מדריך
- study_material: חומר לימודי, שיעורי בית
- activity: חוגים ופעילויות
- noise: הודעות לא רלוונטיות (בדיחות, שיחות כלליות)

שלח התראה מיידית רק אם:
- שינוי ברגע האחרון (היום או מחר)
- ביטול פעילות
- ציוד חובה שחייב להגיע
- מצב חירום`,
      input: content,
      reasoning: {
        effort: 'low'
      },
      text: {
        format: {
          type: 'json_schema',
          name: 'message_classification',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              category: {
                type: 'string',
                enum: [
                  'equipment',
                  'food',
                  'event',
                  'schedule_change',
                  'parent_request',
                  'teacher_message',
                  'study_material',
                  'activity',
                  'noise'
                ]
              },
              urgency: { type: 'number', minimum: 0, maximum: 10 },
              action_required: { type: 'boolean' },
              summary: { type: 'string' },
              child_relevant: { type: 'boolean' },
              send_immediate_alert: { type: 'boolean' }
            },
            required: [
              'category',
              'urgency',
              'action_required',
              'summary',
              'child_relevant',
              'send_immediate_alert'
            ],
            additionalProperties: false
          }
        }
      },
      store: false // Privacy - don't store messages at OpenAI
    });

    return JSON.parse(response.output_text);
  }

  private async createAlert(
    message: Tables<'wa_raw_messages'>,
    classification: MessageClassification
  ): Promise<void> {
    // Get the user ID through the group
    const { data: group } = await this.supabase
      .from('groups')
      .select('user_id')
      .eq('id', message.group_id)
      .single();

    if (!group) return;

    await this.supabase.from('alerts').insert({
      user_id: group.user_id,
      content: classification.summary,
      sent: false
    });
  }

  private async markProcessed(messageId: string): Promise<void> {
    await this.supabase
      .from('wa_raw_messages')
      .update({ processed: true })
      .eq('id', messageId);
  }

  /**
   * Check if message contains weekly schedule info
   */
  private isWeeklyScheduleMessage(content: string): boolean {
    const schedulePatterns = [
      /לו"?ז\s*(ל)?שבוע/i,
      /לוח\s*זמנים/i,
      /שעות\s*(ה)?שבוע/i,
      /אימונים?\s*(ל)?שבוע/i,
      /ראשון.*שני|שני.*שלישי/i, // Day patterns in sequence
    ];
    return schedulePatterns.some(p => p.test(content));
  }

  /**
   * Parse schedule times from message content
   */
  private parseScheduleFromMessage(content: string): Array<{ day: string; startTime: string; endTime: string; location?: string }> {
    const schedule: Array<{ day: string; startTime: string; endTime: string; location?: string }> = [];
    
    const dayMap: Record<string, string> = {
      'ראשון': 'sunday',
      'שני': 'monday', 
      'שלישי': 'tuesday',
      'רביעי': 'wednesday',
      'חמישי': 'thursday',
      'שישי': 'friday',
      'שבת': 'saturday',
      "א'": 'sunday',
      "ב'": 'monday',
      "ג'": 'tuesday',
      "ד'": 'wednesday',
      "ה'": 'thursday',
      "ו'": 'friday',
    };

    // Pattern: day + time range (e.g., "ראשון 16:00-17:30" or "א' 16:00-17:30")
    const timeRangePattern = /(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת|א'|ב'|ג'|ד'|ה'|ו')[:\s]*(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})\s*([^\n\r]*)?/gi;
    
    let match;
    while ((match = timeRangePattern.exec(content)) !== null) {
      const dayHebrew = match[1];
      const startTime = match[2].replace('.', ':');
      const endTime = match[3].replace('.', ':');
      const extraInfo = match[4]?.trim();
      
      const day = dayMap[dayHebrew] || dayHebrew;
      
      schedule.push({
        day,
        startTime,
        endTime,
        location: extraInfo || undefined
      });
    }

    return schedule;
  }

  /**
   * Update activity schedule based on parsed schedule
   */
  private async updateActivitySchedule(
    message: Tables<'wa_raw_messages'>,
    childId: string | null,
    groupName: string
  ): Promise<void> {
    try {
      const parsedSchedule = this.parseScheduleFromMessage(message.content);
      
      if (parsedSchedule.length === 0) {
        console.log('[MessageProcessor] No schedule entries parsed from message');
        return;
      }

      console.log(`[MessageProcessor] Parsed ${parsedSchedule.length} schedule entries:`, parsedSchedule);

      // Get the group to find associated child
      const { data: group } = await this.supabase
        .from('groups')
        .select('child_id, user_id')
        .eq('id', message.group_id)
        .single();

      const targetChildId = childId || group?.child_id;
      
      if (!targetChildId) {
        console.log('[MessageProcessor] No child associated with this group for schedule update');
        return;
      }

      // Find activities for this child that might match
      const { data: activities } = await this.supabase
        .from('activities')
        .select('id, name, schedule')
        .eq('child_id', targetChildId);

      if (!activities || activities.length === 0) {
        console.log('[MessageProcessor] No activities found for child, creating from schedule');
        // Create a new activity from the schedule
        await this.createActivityFromSchedule(targetChildId, groupName, parsedSchedule);
        return;
      }

      // Try to match group name with activity or update the first/most relevant one
      let targetActivity = activities.find(a => 
        groupName.toLowerCase().includes(a.name.toLowerCase()) ||
        a.name.toLowerCase().includes(groupName.split(' ')[0].toLowerCase())
      );

      // If no match found, use the first activity for this child
      if (!targetActivity && activities.length > 0) {
        targetActivity = activities[0];
      }

      if (targetActivity) {
        // Update the activity schedule
        const newSchedule = this.convertScheduleToActivityFormat(parsedSchedule);
        
        const { error } = await this.supabase
          .from('activities')
          .update({ 
            schedule: newSchedule,
            updated_at: new Date().toISOString()
          })
          .eq('id', targetActivity.id);

        if (error) {
          console.error('[MessageProcessor] Error updating activity schedule:', error);
        } else {
          console.log(`[MessageProcessor] Updated schedule for activity "${targetActivity.name}":`, newSchedule);
        }
      }
    } catch (error) {
      console.error('[MessageProcessor] Error in updateActivitySchedule:', error);
    }
  }

  /**
   * Convert parsed schedule to activity format (array of day objects)
   */
  private convertScheduleToActivityFormat(parsedSchedule: Array<{ day: string; startTime: string; endTime: string; location?: string }>): Array<{ day: string; start_time: string; end_time: string; location?: string }> {
    return parsedSchedule.map(entry => ({
      day: entry.day,
      start_time: entry.startTime,
      end_time: entry.endTime,
      ...(entry.location && { location: entry.location })
    }));
  }

  /**
   * Create a new activity from schedule message
   */
  private async createActivityFromSchedule(
    childId: string,
    groupName: string,
    parsedSchedule: Array<{ day: string; startTime: string; endTime: string; location?: string }>
  ): Promise<void> {
    try {
      // Extract activity name from group name
      const activityName = this.extractActivityName(groupName);
      const schedule = this.convertScheduleToActivityFormat(parsedSchedule);

      const { error } = await this.supabase
        .from('activities')
        .insert({
          child_id: childId,
          name: activityName,
          schedule
        });

      if (error) {
        console.error('[MessageProcessor] Error creating activity:', error);
      } else {
        console.log(`[MessageProcessor] Created new activity "${activityName}" with schedule:`, schedule);
      }
    } catch (error) {
      console.error('[MessageProcessor] Error in createActivityFromSchedule:', error);
    }
  }

  /**
   * Extract activity name from group name
   */
  private extractActivityName(groupName: string): string {
    // Remove common suffixes like "הורים", emojis, year references
    let name = groupName
      .replace(/הורים/g, '')
      .replace(/תשפ"?[א-ה]/g, '')
      .replace(/[\u{1F300}-\u{1F9FF}]/gu, '') // Remove emojis
      .replace(/[-–]/g, ' ')
      .trim();
    
    // Clean up multiple spaces
    name = name.replace(/\s+/g, ' ').trim();
    
    return name || groupName;
  }

  /**
   * Send immediate WhatsApp alert via GreenAPI
   */
  private async sendImmediateWhatsAppAlert(
    message: Tables<'wa_raw_messages'>,
    savedItem: Tables<'extracted_items'>,
    childId: string | null,
    groupName: string
  ): Promise<void> {
    try {
      // Get the scheduler and its GreenAPI sender
      const scheduler = getScheduler();
      if (!scheduler) {
        console.log('[MessageProcessor] Scheduler not available for immediate alert');
        return;
      }

      // Get user ID and child name
      const { data: group } = await this.supabase
        .from('groups')
        .select('user_id')
        .eq('id', message.group_id)
        .single();

      if (!group) return;

      let childName: string | null = null;
      if (childId) {
        const { data: child } = await this.supabase
          .from('children')
          .select('name')
          .eq('id', childId)
          .single();
        childName = child?.name || null;
      }

      // Send the alert
      const greenApiSender = scheduler.getGreenApiSender();
      await greenApiSender.sendImmediateAlert(group.user_id, savedItem, childName, groupName);
      
      console.log(`[MessageProcessor] Immediate alert sent for item ${savedItem.id}`);
    } catch (error) {
      console.error('[MessageProcessor] Error sending immediate alert:', error);
    }
  }

  /**
   * Check if message contains game/match information
   */
  private containsGameInfo(content: string): boolean {
    const gamePatterns = [
      /משחק/i,
      /הסעה.*משחק/i,
      /משחק.*נגד/i,
      /משחק.*ב[א-ת]+/i, // משחק במקיף, משחק באשדוד
      /\d{1,2}\.\d{1,2}.*נגד/i, // תאריך + נגד
      /משחקים?\s*קרובים/i,
    ];
    return gamePatterns.some(p => p.test(content));
  }

  /**
   * Parse game details from message
   */
  private parseGameDetails(content: string): Array<{
    date: Date | null;
    time: string | null;
    location: string | null;
    opponent: string | null;
    description: string;
  }> {
    const games: Array<{
      date: Date | null;
      time: string | null;
      location: string | null;
      opponent: string | null;
      description: string;
    }> = [];

    // Pattern for "7.1 מקיף ב' נגד..." or "משחק ב-15/1"
    const dateGamePattern = /(\d{1,2})[.\/](\d{1,2})(?:[.\/](\d{2,4}))?\s*(?:[-–]\s*)?([^\n]+)?/g;
    const timePattern = /(\d{1,2}[:.]\d{2})/;
    const opponentPattern = /נגד\s+([א-ת\s]+)/i;
    const locationPattern = /ב([א-ת]+(?:\s+[א-ת]+)*)/i;

    let match;
    while ((match = dateGamePattern.exec(content)) !== null) {
      const day = parseInt(match[1]);
      const month = parseInt(match[2]);
      const yearStr = match[3];
      const extraInfo = match[4] || '';

      // Check if this line contains game-related info
      const fullLine = content.substring(Math.max(0, match.index - 50), match.index + 100);
      if (!this.containsGameInfo(fullLine)) continue;

      // Parse year
      let year = new Date().getFullYear();
      if (yearStr) {
        year = yearStr.length === 2 ? 2000 + parseInt(yearStr) : parseInt(yearStr);
      }

      // Create date (months are 0-indexed in JS)
      const gameDate = new Date(year, month - 1, day);
      
      // If date is in the past, assume next year
      if (gameDate < new Date()) {
        gameDate.setFullYear(gameDate.getFullYear() + 1);
      }

      // Parse time
      const timeMatch = extraInfo.match(timePattern);
      const time = timeMatch ? timeMatch[1].replace('.', ':') : null;

      // Parse opponent
      const oppMatch = extraInfo.match(opponentPattern);
      const opponent = oppMatch ? oppMatch[1].trim() : null;

      // Parse location
      const locMatch = extraInfo.match(locationPattern);
      const location = locMatch ? locMatch[1].trim() : null;

      games.push({
        date: gameDate,
        time,
        location,
        opponent,
        description: extraInfo.trim()
      });
    }

    // Also check for "הסעה" patterns with time but no date (use day name)
    const dayGamePattern = /(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)[:\s]*(\d{1,2}[:.]\d{2})?\s*(?:הסעה|משחק)([^\n]*)/gi;
    while ((match = dayGamePattern.exec(content)) !== null) {
      const dayName = match[1];
      const time = match[2]?.replace('.', ':') || null;
      const extraInfo = match[3] || '';

      // Calculate the next occurrence of this day
      const dayMap: Record<string, number> = {
        'ראשון': 0, 'שני': 1, 'שלישי': 2, 'רביעי': 3,
        'חמישי': 4, 'שישי': 5, 'שבת': 6
      };

      const targetDay = dayMap[dayName];
      if (targetDay !== undefined) {
        const today = new Date();
        const currentDay = today.getDay();
        let daysUntil = targetDay - currentDay;
        if (daysUntil <= 0) daysUntil += 7;
        
        const gameDate = new Date(today);
        gameDate.setDate(today.getDate() + daysUntil);

        const locMatch = extraInfo.match(/ב([א-ת]+(?:\s+[א-ת]+)*)/i);
        
        games.push({
          date: gameDate,
          time,
          location: locMatch ? locMatch[1].trim() : null,
          opponent: null,
          description: `${dayName} ${time || ''} ${extraInfo}`.trim()
        });
      }
    }

    return games;
  }

  /**
   * Create calendar event for detected game
   */
  private async createGameCalendarEvent(
    message: Tables<'wa_raw_messages'>,
    childId: string | null,
    groupName: string
  ): Promise<void> {
    try {
      const games = this.parseGameDetails(message.content);
      
      if (games.length === 0) {
        console.log('[MessageProcessor] No game details parsed from message');
        return;
      }

      // Get group and user info
      const { data: group } = await this.supabase
        .from('groups')
        .select('user_id, child_id')
        .eq('id', message.group_id)
        .single();

      if (!group) return;

      const targetChildId = childId || group.child_id;

      // Get user's phone number for WhatsApp notification
      const { data: user } = await this.supabase
        .from('users')
        .select('phone')
        .eq('id', group.user_id)
        .single();

      // Get child name for the event
      let childName = '';
      if (targetChildId) {
        const { data: child } = await this.supabase
          .from('children')
          .select('name')
          .eq('id', targetChildId)
          .single();
        childName = child?.name || '';
      }

      for (const game of games) {
        if (!game.date) continue;

        // Create event summary
        const summary = game.opponent 
          ? `משחק ${childName ? `של ${childName}` : ''} נגד ${game.opponent}`
          : `משחק ${childName ? `של ${childName}` : ''} - ${groupName}`;

        // Calculate start and end times
        const startTime = new Date(game.date);
        if (game.time) {
          const [hours, minutes] = game.time.split(':').map(Number);
          startTime.setHours(hours, minutes, 0, 0);
        } else {
          startTime.setHours(18, 0, 0, 0); // Default to 18:00
        }

        const endTime = new Date(startTime);
        endTime.setHours(endTime.getHours() + 2); // Assume 2 hour duration

        // Check if we already have this pending approval
        const { data: existing } = await this.supabase
          .from('pending_approvals')
          .select('id')
          .eq('user_id', group.user_id)
          .eq('event_summary', summary)
          .eq('event_start', startTime.toISOString())
          .single();

        if (existing) {
          console.log(`[MessageProcessor] Game event already pending: ${summary}`);
          continue;
        }

        // Create pending approval for calendar event
        const { data: pendingApproval, error } = await this.supabase
          .from('pending_approvals')
          .insert({
            user_id: group.user_id,
            phone: user?.phone || '',
            event_summary: summary,
            event_description: game.description,
            event_start: startTime.toISOString(),
            event_end: endTime.toISOString(),
            event_location: game.location,
            original_message_id: message.id,
            status: 'pending'
          })
          .select()
          .single();

        if (error) {
          console.error('[MessageProcessor] Error creating pending approval:', error);
          continue;
        }

        console.log(`[MessageProcessor] Created pending approval for game: ${summary}`);

        // Send WhatsApp message asking for approval
        if (user?.phone && pendingApproval) {
          await this.sendGameApprovalRequest(group.user_id, pendingApproval, childName);
        }
      }
    } catch (error) {
      console.error('[MessageProcessor] Error in createGameCalendarEvent:', error);
    }
  }

  /**
   * Send WhatsApp message asking if user wants to add game to calendar
   */
  private async sendGameApprovalRequest(
    userId: string,
    pendingApproval: any,
    childName: string
  ): Promise<void> {
    try {
      const scheduler = getScheduler();
      if (!scheduler) return;

      const greenApiSender = scheduler.getGreenApiSender();
      
      const startDate = new Date(pendingApproval.event_start);
      const dateStr = startDate.toLocaleDateString('he-IL', {
        weekday: 'long',
        day: 'numeric',
        month: 'long'
      });
      const timeStr = startDate.toLocaleTimeString('he-IL', {
        hour: '2-digit',
        minute: '2-digit'
      });

      const message = `זוהה משחק חדש!\n\n` +
        `${pendingApproval.event_summary}\n` +
        `תאריך: ${dateStr}\n` +
        `שעה: ${timeStr}\n` +
        (pendingApproval.event_location ? `מיקום: ${pendingApproval.event_location}\n` : '') +
        `\nהאם להוסיף ליומן Google?\n` +
        `השב "כן" להוספה או "לא" לביטול`;

      await greenApiSender.sendMessageToUser(userId, message);
      
      console.log(`[MessageProcessor] Sent game approval request to user ${userId}`);
    } catch (error) {
      console.error('[MessageProcessor] Error sending game approval request:', error);
    }
  }
}

