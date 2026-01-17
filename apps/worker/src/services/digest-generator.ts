/**
 * Digest Generator
 * 
 * Generates and sends daily summaries to users.
 * Uses OpenAI GPT-5.2 to create friendly, concise summaries.
 */

import OpenAI from 'openai';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables } from '@parent-assistant/database';
import { greenAPIService } from './greenapi.js';
import { isWithinQuietHours } from '@parent-assistant/shared';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const MODEL = 'gpt-5.2-2025-12-11';

export class DigestGenerator {
  private supabase: SupabaseClient<Database>;

  constructor(supabase: SupabaseClient<Database>) {
    this.supabase = supabase;
  }

  /**
   * Generate and send daily digests to all users
   * Should be called by a cron job
   */
  async generateAllDigests(): Promise<void> {
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    // Get users whose digest time matches current time (within 5 minute window)
    const { data: users } = await this.supabase
      .from('users')
      .select('id, phone, daily_summary_time, notification_settings')
      .not('phone', 'is', null);

    if (!users) return;

    for (const user of users) {
      const settings = user.notification_settings as {
        daily_summary_enabled: boolean;
        quiet_hours_start: string;
        quiet_hours_end: string;
      };

      // Check if digest is enabled
      if (!settings?.daily_summary_enabled) continue;

      // Check if it's time for this user's digest
      const userTime = user.daily_summary_time || '20:30';
      if (!this.isWithinTimeWindow(currentTime, userTime, 5)) continue;

      // Check if already sent today
      const today = now.toISOString().split('T')[0];
      const { data: existingDigest } = await this.supabase
        .from('digests')
        .select('id')
        .eq('user_id', user.id)
        .eq('digest_date', today)
        .single();

      if (existingDigest) continue;

      // Generate and send digest
      await this.generateUserDigest(user.id, user.phone!);
    }
  }

  /**
   * Generate digest for a single user
   */
  async generateUserDigest(userId: string, phone: string): Promise<void> {
    try {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      // Filter to only items belonging to this user's children
      const { data: userChildren } = await this.supabase
        .from('children')
        .select('id, name')
        .eq('user_id', userId);

      const childIds = new Set(userChildren?.map(c => c.id) || []);
      const childIdsArray = Array.from(childIds);

      // Get extracted items from the last 24 hours for this user's children
      const { data: items } = await this.supabase
        .from('extracted_items')
        .select(`
          id,
          category,
          urgency,
          action_required,
          summary,
          created_at,
          child_id
        `)
        .gte('created_at', yesterday.toISOString())
        .not('category', 'eq', 'noise')
        .or(`child_id.is.null,child_id.in.(${childIdsArray.join(',')})`)
        .order('urgency', { ascending: false });

      const userItems = items || [];

      // Get tomorrow's activities
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowDay = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][tomorrow.getDay()];

      const { data: activities } = await this.supabase
        .from('activities')
        .select(`
          name,
          schedule,
          child:children(name)
        `)
        .in('child_id', Array.from(childIds));

      const tomorrowActivities = activities?.filter(activity => {
        const schedule = activity.schedule as { day: string; start_time: string }[] || [];
        return schedule.some(slot => slot.day === tomorrowDay);
      }) || [];

      // Generate summary with AI
      const digestContent = await this.generateSummaryWithAI(
        userItems,
        tomorrowActivities,
        userChildren?.map(c => c.name) || [],
        tomorrow
      );

      // Save digest to database
      const todayStr = today.toISOString().split('T')[0];
      await this.supabase.from('digests').insert({
        user_id: userId,
        digest_date: todayStr,
        content: digestContent,
        items_count: userItems.length,
        sent_at: new Date().toISOString()
      });

      // Send via GreenAPI
      await greenAPIService.sendDailySummary(phone, digestContent);

      console.log(`Digest sent to user ${userId}`);
    } catch (error) {
      console.error(`Failed to generate digest for user ${userId}:`, error);
    }
  }

  /**
   * Generate summary using GPT-5.2
   */
  private async generateSummaryWithAI(
    items: any[],
    tomorrowActivities: any[],
    childrenNames: string[],
    tomorrow: Date
  ): Promise<string> {
    if (items.length === 0 && tomorrowActivities.length === 0) {
      return `יום רגוע! אין עדכונים מיוחדים להיום.\n\nמחר אין פעילויות מתוכננות.`;
    }

    const response = await openai.responses.create({
      model: MODEL,
      instructions: `אתה עוזר אישי חברי להורים. צור סיכום יומי קצר וברור.
הטון: חברי, רגוע, לא טכני.
שמות הילדים: ${childrenNames.join(', ')}
תאריך מחר: ${tomorrow.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })}

המבנה:
1. פתיחה חמה וקצרה
2. מה חשוב למחר (ציוד, אירועים, חוגים)
3. שינויים או התראות
4. סיום חיובי

כללים:
- עד 200 מילים
- פסקאות קצרות
- שימוש ב-* לסימון דגשים
- לא לשכפל מידע
- אם אין מידע בקטגוריה, לדלג עליה`,
      input: JSON.stringify({
        recent_items: items.map(item => ({
          category: item.category,
          urgency: item.urgency,
          summary: item.summary,
          child: item.child?.name,
          action_required: item.action_required
        })),
        tomorrow_activities: tomorrowActivities.map(a => ({
          name: a.name,
          child: a.child?.name,
          schedule: a.schedule
        }))
      }),
      reasoning: {
        effort: 'medium'
      },
      text: {},
      store: false
    });

    return response.output_text;
  }

  /**
   * Check if current time is within window of target time
   */
  private isWithinTimeWindow(current: string, target: string, windowMinutes: number): boolean {
    const [currentH, currentM] = current.split(':').map(Number);
    const [targetH, targetM] = target.split(':').map(Number);

    const currentMinutes = currentH * 60 + currentM;
    const targetMinutes = targetH * 60 + targetM;

    return Math.abs(currentMinutes - targetMinutes) <= windowMinutes;
  }
}


