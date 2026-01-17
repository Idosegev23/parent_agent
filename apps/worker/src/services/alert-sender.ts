/**
 * Alert Sender
 * 
 * Sends immediate alerts to users for urgent items.
 * Respects quiet hours settings.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@parent-assistant/database';
import { greenAPIService } from './greenapi.js';
import { isWithinQuietHours } from '@parent-assistant/shared';

export class AlertSender {
  private supabase: SupabaseClient<Database>;

  constructor(supabase: SupabaseClient<Database>) {
    this.supabase = supabase;
  }

  /**
   * Process and send pending alerts
   * Should be called periodically (e.g., every minute)
   */
  async processPendingAlerts(): Promise<void> {
    // Get unsent alerts
    const { data: alerts } = await this.supabase
      .from('alerts')
      .select(`
        id,
        user_id,
        content,
        user:users(phone, notification_settings)
      `)
      .eq('sent', false)
      .order('created_at', { ascending: true })
      .limit(10);

    if (!alerts || alerts.length === 0) return;

    const now = new Date();

    for (const alert of alerts) {
      const user = alert.user as unknown as {
        phone: string | null;
        notification_settings: {
          immediate_alerts_enabled: boolean;
          quiet_hours_start: string;
          quiet_hours_end: string;
        };
      };

      if (!user?.phone) continue;

      const settings = user.notification_settings;

      // Check if alerts are enabled
      if (!settings?.immediate_alerts_enabled) {
        await this.markAlertSent(alert.id);
        continue;
      }

      // Check quiet hours
      if (isWithinQuietHours(now, settings.quiet_hours_start, settings.quiet_hours_end)) {
        console.log(`Skipping alert ${alert.id} - quiet hours`);
        continue;
      }

      // Send alert
      const sent = await greenAPIService.sendAlert(user.phone, alert.content);

      if (sent) {
        await this.markAlertSent(alert.id);
        console.log(`Alert ${alert.id} sent successfully`);
      }
    }
  }

  /**
   * Create an immediate alert for a user
   */
  async createAlert(userId: string, content: string, itemId?: string): Promise<void> {
    await this.supabase.from('alerts').insert({
      user_id: userId,
      item_id: itemId || null,
      content,
      sent: false
    });
  }

  /**
   * Mark alert as sent
   */
  private async markAlertSent(alertId: string): Promise<void> {
    await this.supabase
      .from('alerts')
      .update({
        sent: true,
        sent_at: new Date().toISOString()
      })
      .eq('id', alertId);
  }
}




