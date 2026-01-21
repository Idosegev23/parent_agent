/**
 * Scheduler Service
 * 
 * Manages scheduled tasks:
 * - Daily digest at 19:00
 * - Queue processing for missed messages
 */

import cron from 'node-cron';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@parent-assistant/database';
import { GreenAPISender } from './greenapi-sender.js';
import { CalendarService } from './calendar-service.js';
import { isShabbatOrHoliday } from '../utils/hebrew-calendar.js';

// Israel timezone
const ISRAEL_TZ = 'Asia/Jerusalem';

export class Scheduler {
  private supabase: SupabaseClient<Database>;
  private greenApiSender: GreenAPISender;
  private calendarService: CalendarService;
  private digestJob: ReturnType<typeof cron.schedule> | null = null;
  private queueJob: ReturnType<typeof cron.schedule> | null = null;
  private calendarJob: ReturnType<typeof cron.schedule> | null = null;

  constructor(supabase: SupabaseClient<Database>) {
    this.supabase = supabase;
    this.greenApiSender = new GreenAPISender(supabase);
    this.calendarService = new CalendarService(this.greenApiSender);
  }

  /**
   * Start all scheduled jobs
   */
  start(): void {
    console.log('[Scheduler] Starting scheduled jobs...');

    // Daily digest at 19:00 Israel time
    this.digestJob = cron.schedule('0 19 * * *', async () => {
      console.log('[Scheduler] Running daily digest job');
      await this.runDailyDigest();
    }, {
      timezone: ISRAEL_TZ
    });

    // Process queue every 5 minutes (for retries and Motzaei Shabbat)
    this.queueJob = cron.schedule('*/5 * * * *', async () => {
      await this.processMessageQueue();
    }, {
      timezone: ISRAEL_TZ
    });

    // Calendar event processing every 10 minutes
    this.calendarJob = cron.schedule('*/10 * * * *', async () => {
      await this.processCalendarEvents();
    }, {
      timezone: ISRAEL_TZ
    });

    console.log('[Scheduler] Jobs started:');
    console.log('  - Daily digest: 19:00 Israel time');
    console.log('  - Queue processing: every 5 minutes');
    console.log('  - Calendar events: every 10 minutes');
  }

  /**
   * Stop all scheduled jobs
   */
  stop(): void {
    console.log('[Scheduler] Stopping scheduled jobs...');
    
    if (this.digestJob) {
      this.digestJob.stop();
      this.digestJob = null;
    }
    
    if (this.queueJob) {
      this.queueJob.stop();
      this.queueJob = null;
    }

    if (this.calendarJob) {
      this.calendarJob.stop();
      this.calendarJob = null;
    }
  }

  /**
   * Run daily digest for all users
   */
  async runDailyDigest(): Promise<void> {
    // Check if it's Shabbat/holiday - skip and queue for later
    if (isShabbatOrHoliday()) {
      console.log('[Scheduler] Shabbat/holiday - skipping digest, will queue');
      // Messages will be queued in GreenAPISender
    }

    try {
      // Get all users who opted in for WhatsApp notifications
      const { data: users, error } = await this.supabase
        .from('users')
        .select('id')
        .eq('wa_opt_in', true)
        .not('phone', 'is', null);

      if (error) {
        console.error('[Scheduler] Error fetching users:', error);
        return;
      }

      if (!users || users.length === 0) {
        console.log('[Scheduler] No users opted in for digests');
        return;
      }

      console.log(`[Scheduler] Sending digests to ${users.length} users`);

      // Send digest to each user
      let success = 0;
      let failed = 0;

      for (const user of users) {
        try {
          const sent = await this.greenApiSender.sendDailyDigest(user.id);
          if (sent) {
            success++;
          } else {
            failed++;
          }
        } catch (error) {
          console.error(`[Scheduler] Error sending digest to ${user.id}:`, error);
          failed++;
        }
      }

      console.log(`[Scheduler] Digest complete: ${success} sent, ${failed} failed`);

      // Save digest to database
      await this.saveDailyDigestRecord(success, failed);
    } catch (error) {
      console.error('[Scheduler] Error in daily digest:', error);
    }
  }

  /**
   * Process the message queue (retries and delayed messages)
   */
  private async processMessageQueue(): Promise<void> {
    try {
      const processed = await this.greenApiSender.processQueue();
      if (processed > 0) {
        console.log(`[Scheduler] Processed ${processed} queued messages`);
      }
    } catch (error) {
      console.error('[Scheduler] Error processing queue:', error);
    }
  }

  /**
   * Save a record of the daily digest run
   */
  private async saveDailyDigestRecord(success: number, failed: number): Promise<void> {
    // Log to audit
    try {
      await this.supabase.from('audit_logs').insert({
        action: 'daily_digest',
        entity_type: 'digests',
        metadata: {
          date: new Date().toISOString(),
          users_success: success,
          users_failed: failed
        }
      });
    } catch (error) {
      console.error('[Scheduler] Error saving digest record:', error);
    }
  }

  /**
   * Manually trigger a digest for testing
   */
  async triggerDigestNow(): Promise<void> {
    console.log('[Scheduler] Manual digest trigger');
    await this.runDailyDigest();
  }

  /**
   * Get the GreenAPI sender instance (for immediate alerts)
   */
  getGreenApiSender(): GreenAPISender {
    return this.greenApiSender;
  }

  /**
   * Get the calendar service instance
   */
  getCalendarService(): CalendarService {
    return this.calendarService;
  }

  /**
   * Process calendar events - send approval requests for detected events
   */
  async processCalendarEvents(): Promise<void> {
    try {
      // Get all users with calendar connections
      const { data: connections, error } = await this.supabase
        .from('calendar_connections')
        .select('user_id')
        .eq('is_active', true);

      if (error || !connections || connections.length === 0) {
        return;
      }

      for (const conn of connections) {
        if (!conn.user_id) continue;

        // Get user's phone
        const { data: user } = await this.supabase
          .from('users')
          .select('phone, wa_opt_in')
          .eq('id', conn.user_id)
          .single();

        if (!user?.phone || !user.wa_opt_in) {
          continue;
        }

        await this.calendarService.processExtractedEvents(conn.user_id, user.phone!);
      }

      // Clean up expired approvals
      await this.calendarService.cleanupExpiredApprovals();
    } catch (error) {
      console.error('[Scheduler] Error processing calendar events:', error);
    }
  }
}

// Singleton instance
let schedulerInstance: Scheduler | null = null;

/**
 * Initialize and start the scheduler
 */
export function startScheduler(supabase: SupabaseClient<Database>): Scheduler {
  if (schedulerInstance) {
    console.log('[Scheduler] Already running');
    return schedulerInstance;
  }

  schedulerInstance = new Scheduler(supabase);
  schedulerInstance.start();
  return schedulerInstance;
}

/**
 * Stop the scheduler
 */
export function stopScheduler(): void {
  if (schedulerInstance) {
    schedulerInstance.stop();
    schedulerInstance = null;
  }
}

/**
 * Get the scheduler instance
 */
export function getScheduler(): Scheduler | null {
  return schedulerInstance;
}

