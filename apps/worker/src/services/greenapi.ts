/**
 * GreenAPI Service
 * 
 * Handles sending WhatsApp messages via GreenAPI.
 * Used for:
 * - Daily summaries
 * - Immediate alerts
 * - System notifications (connection status)
 */

const GREENAPI_URL = 'https://api.green-api.com';

interface GreenAPIConfig {
  instanceId: string;
  apiToken: string;
}

export class GreenAPIService {
  private config: GreenAPIConfig;

  constructor() {
    this.config = {
      instanceId: process.env.GREENAPI_INSTANCE_ID || '',
      apiToken: process.env.GREENAPI_API_TOKEN || ''
    };

    if (!this.config.instanceId || !this.config.apiToken) {
      console.warn('GreenAPI credentials not configured');
    }
  }

  private get baseUrl(): string {
    return `${GREENAPI_URL}/waInstance${this.config.instanceId}`;
  }

  /**
   * Send a text message to a phone number
   */
  async sendMessage(phoneNumber: string, message: string): Promise<boolean> {
    if (!this.config.instanceId || !this.config.apiToken) {
      console.error('GreenAPI not configured');
      return false;
    }

    try {
      // Format phone number (remove leading 0, add country code)
      const formattedPhone = this.formatPhoneNumber(phoneNumber);
      const chatId = `${formattedPhone}@c.us`;

      const response = await fetch(
        `${this.baseUrl}/sendMessage/${this.config.apiToken}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            chatId,
            message
          })
        }
      );

      if (!response.ok) {
        const error = await response.text();
        console.error('GreenAPI error:', error);
        return false;
      }

      const result = await response.json();
      console.log('Message sent:', result.idMessage);
      return true;
    } catch (error) {
      console.error('Failed to send message:', error);
      return false;
    }
  }

  /**
   * Format Israeli phone number for WhatsApp
   */
  private formatPhoneNumber(phone: string): string {
    // Remove all non-digits
    let cleaned = phone.replace(/\D/g, '');

    // Handle Israeli numbers
    if (cleaned.startsWith('0')) {
      cleaned = '972' + cleaned.substring(1);
    } else if (!cleaned.startsWith('972')) {
      cleaned = '972' + cleaned;
    }

    return cleaned;
  }

  /**
   * Send daily summary to user
   */
  async sendDailySummary(phone: string, summary: string): Promise<boolean> {
    const message = `*סיכום יומי - עוזר להורים*\n\n${summary}`;
    return this.sendMessage(phone, message);
  }

  /**
   * Send immediate alert
   */
  async sendAlert(phone: string, alertContent: string): Promise<boolean> {
    const message = `*התראה דחופה*\n\n${alertContent}`;
    return this.sendMessage(phone, message);
  }

  /**
   * Send connection status notification
   */
  async sendConnectionNotification(
    phone: string,
    status: 'connected' | 'disconnected' | 'requires_reauth'
  ): Promise<boolean> {
    const messages = {
      connected: 'WhatsApp חובר בהצלחה. המערכת מתחילה לקרוא הודעות מהקבוצות.',
      disconnected: 'WhatsApp נותק. יש להתחבר מחדש דרך ההגדרות.',
      requires_reauth: 'נדרשת סריקת QR מחדש. היכנסו להגדרות לחיבור מחדש.'
    };

    return this.sendMessage(phone, `*עוזר להורים*\n\n${messages[status]}`);
  }
}

// Singleton instance
export const greenAPIService = new GreenAPIService();




