'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { QRCodeSVG } from 'qrcode.react';
import { 
  Bell, 
  Clock, 
  Smartphone, 
  Save, 
  Wifi, 
  WifiOff,
  RefreshCw,
  Loader2,
  Calendar,
  Check,
  X,
  ExternalLink
} from 'lucide-react';

// Format phone number to international format (972...)
function formatPhoneNumber(phone: string): string {
  // Remove all non-digit characters
  let digits = phone.replace(/\D/g, '');
  
  // Handle Israeli numbers
  if (digits.startsWith('0')) {
    // Remove leading 0 and add 972
    digits = '972' + digits.slice(1);
  } else if (!digits.startsWith('972') && digits.length === 9) {
    // If 9 digits without prefix, assume Israeli and add 972
    digits = '972' + digits;
  }
  
  return digits;
}

// Format for display (add dashes)
function formatPhoneForDisplay(phone: string): string {
  if (!phone) return '';
  // If already in international format, show as is
  if (phone.startsWith('972')) {
    return phone;
  }
  return phone;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState({
    phone: '',
    wa_opt_in: true,
    daily_summary_time: '19:00',
    notification_settings: {
      daily_summary_enabled: true,
      immediate_alerts_enabled: true,
      quiet_hours_start: '22:00',
      quiet_hours_end: '07:00'
    }
  });
  const [waSession, setWaSession] = useState<{
    status: string;
    qr_code: string | null;
    last_heartbeat: string | null;
  } | null>(null);
  const [calendarConnection, setCalendarConnection] = useState<{
    id: string;
    provider: string;
    is_active: boolean;
    created_at: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isConnectingCalendar, setIsConnectingCalendar] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadData();
    
    // Handle OAuth callback messages
    const urlParams = new URLSearchParams(window.location.search);
    const success = urlParams.get('success');
    const error = urlParams.get('error');
    
    if (success === 'calendar_connected') {
      setMessage('חיבור היומן הושלם בהצלחה!');
      // Clean URL
      window.history.replaceState({}, '', '/settings');
    } else if (error) {
      const errorMessages: Record<string, string> = {
        'google_oauth_failed': 'החיבור ל-Google נכשל',
        'no_code': 'לא התקבל קוד אימות',
        'token_exchange_failed': 'שגיאה בקבלת הרשאות',
        'database_error': 'שגיאה בשמירת החיבור',
        'unexpected_error': 'שגיאה לא צפויה',
      };
      setMessage(errorMessages[error] || 'שגיאה בחיבור היומן');
      window.history.replaceState({}, '', '/settings');
    }
  }, []);

  // Subscribe to real-time updates for WA session
  useEffect(() => {
    const supabase = createClient();
    
    const setupRealtimeSubscription = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Subscribe to wa_sessions changes for this user
      const channel = supabase
        .channel('wa_session_updates')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'wa_sessions',
            filter: `user_id=eq.${user.id}`
          },
          (payload) => {
            console.log('[Settings] WA session update:', payload);
            if (payload.new) {
              setWaSession(payload.new as any);
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    };

    const cleanup = setupRealtimeSubscription();
    
    return () => {
      cleanup.then(fn => fn?.());
    };
  }, []);

  // Fallback polling for QR code (in case realtime doesn't work)
  useEffect(() => {
    if (waSession?.status === 'qr_required' && !waSession.qr_code) {
      const interval = setInterval(() => {
        loadData();
      }, 2000); // Poll every 2 seconds until QR arrives
      return () => clearInterval(interval);
    }
  }, [waSession?.status, waSession?.qr_code]);

  const loadData = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return;

    const [{ data: userData }, { data: sessionData }, { data: calendarData }] = await Promise.all([
      supabase.from('users').select('*').eq('id', user.id).single(),
      supabase.from('wa_sessions').select('*').eq('user_id', user.id).single(),
      (supabase.from('calendar_connections') as any).select('*').eq('user_id', user.id).eq('provider', 'google').single()
    ]);

    if (userData) {
      const user = userData as any;
      setSettings({
        phone: user.phone || '',
        wa_opt_in: user.wa_opt_in ?? true,
        daily_summary_time: user.daily_summary_time || '19:00',
        notification_settings: user.notification_settings || {
          daily_summary_enabled: true,
          immediate_alerts_enabled: true,
          quiet_hours_start: '22:00',
          quiet_hours_end: '07:00'
        }
      });
    }

    if (sessionData) {
      setWaSession(sessionData);
    }

    if (calendarData) {
      setCalendarConnection(calendarData);
    }

    setIsLoading(false);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setMessage('');

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return;

    // Format phone number before saving
    const formattedPhone = settings.phone ? formatPhoneNumber(settings.phone) : null;
    console.log('[Settings] Saving phone:', settings.phone, '-> formatted:', formattedPhone);
    console.log('[Settings] WA Opt-in:', settings.wa_opt_in);

    const updateData = {
      phone: formattedPhone,
      wa_opt_in: settings.wa_opt_in,
      daily_summary_time: settings.daily_summary_time,
      notification_settings: settings.notification_settings
    };
    
    const { error } = await (supabase.from('users') as any)
      .update(updateData)
      .eq('id', user.id);

    setIsSaving(false);

    if (error) {
      console.error('[Settings] Save error:', error);
      setMessage('שגיאה בשמירת ההגדרות');
    } else {
      // Update local state with formatted phone
      setSettings(prev => ({ ...prev, phone: formattedPhone || '' }));
      setMessage('ההגדרות נשמרו בהצלחה');
      setTimeout(() => setMessage(''), 3000);
    }
  };

  const requestQrCode = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return;

    await (supabase.from('wa_sessions') as any)
      .update({ status: 'qr_required' })
      .eq('user_id', user.id);

    loadData();
  };

  const connectGoogleCalendar = async () => {
    setIsConnectingCalendar(true);
    
    // Build Google OAuth URL
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    const redirectUri = `${window.location.origin}/api/auth/google/callback`;
    const scope = encodeURIComponent('https://www.googleapis.com/auth/calendar');
    const state = Math.random().toString(36).substring(7);
    
    // Store state in localStorage for verification
    localStorage.setItem('google_oauth_state', state);
    
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&access_type=offline&prompt=consent&state=${state}`;
    
    window.location.href = authUrl;
  };

  const disconnectGoogleCalendar = async () => {
    if (!confirm('האם אתה בטוח שברצונך לנתק את חיבור היומן?')) return;
    
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !calendarConnection) return;

    await (supabase.from('calendar_connections') as any)
      .delete()
      .eq('id', calendarConnection.id);

    setCalendarConnection(null);
    setMessage('חיבור היומן נותק בהצלחה');
    setTimeout(() => setMessage(''), 3000);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">הגדרות</h1>
        <p className="text-muted-foreground">ניהול התראות וחיבור WhatsApp</p>
      </div>

      {/* WhatsApp Connection */}
      <div id="whatsapp" className="bg-white rounded-xl border p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
            waSession?.status === 'connected' ? 'bg-green-100' : 'bg-red-100'
          }`}>
            {waSession?.status === 'connected' ? (
              <Wifi className="w-5 h-5 text-green-600" />
            ) : (
              <WifiOff className="w-5 h-5 text-red-600" />
            )}
          </div>
          <div>
            <h2 className="text-lg font-semibold">חיבור WhatsApp</h2>
            <p className="text-sm text-muted-foreground">
              סטטוס: {waSession?.status === 'connected' ? 'מחובר' : 'לא מחובר'}
            </p>
          </div>
        </div>

        {waSession?.status === 'qr_required' && waSession.qr_code ? (
          <div className="bg-muted/50 rounded-lg p-6 text-center">
            <p className="text-lg font-medium text-foreground mb-2">
              סרקו את הקוד באמצעות WhatsApp
            </p>
            <p className="text-sm text-muted-foreground mb-6">
              פתחו WhatsApp בטלפון ← הגדרות ← מכשירים מקושרים ← קישור מכשיר
            </p>
            <div className="bg-white p-6 rounded-xl inline-block shadow-lg">
              <QRCodeSVG 
                value={waSession.qr_code} 
                size={256}
                level="M"
                includeMargin={true}
              />
            </div>
            <div className="mt-4 flex items-center justify-center gap-4">
              <button
                onClick={loadData}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm text-primary hover:bg-primary/10 rounded-lg transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                רענן
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              הקוד תקף ל-60 שניות
            </p>
          </div>
        ) : waSession?.status === 'qr_required' && !waSession.qr_code ? (
          <div className="bg-muted/50 rounded-lg p-6 text-center">
            <Loader2 className="w-12 h-12 mx-auto mb-4 text-primary animate-spin" />
            <p className="text-foreground font-medium">ממתין ליצירת QR Code...</p>
            <p className="text-sm text-muted-foreground mt-2">
              אנא המתינו, זה עשוי לקחת מספר שניות
            </p>
            <button
              onClick={loadData}
              className="mt-4 inline-flex items-center gap-2 text-sm text-primary hover:underline"
            >
              <RefreshCw className="w-4 h-4" />
              רענן
            </button>
          </div>
        ) : waSession?.status !== 'connected' ? (
          <button
            onClick={requestQrCode}
            className="w-full py-3 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition-colors"
          >
            חבר WhatsApp
          </button>
        ) : (
          <div className="space-y-4">
            <div className="bg-green-50 rounded-lg p-4">
              <p className="text-green-800 text-sm">
                WhatsApp מחובר ופעיל. ההודעות מהקבוצות נקראות אוטומטית.
              </p>
              {waSession.last_heartbeat && (
                <p className="text-green-600 text-xs mt-1">
                  עדכון אחרון: {new Date(waSession.last_heartbeat).toLocaleTimeString('he-IL')}
                </p>
              )}
            </div>

            {/* Phone number for receiving messages */}
            <div className="pt-4 border-t">
              <div className="flex items-center gap-3 mb-4">
                <Smartphone className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="font-medium text-foreground">מספר טלפון לקבלת סיכומים</p>
                  <p className="text-sm text-muted-foreground">הסיכום היומי והתראות ישלחו למספר זה</p>
                </div>
              </div>
              
              <div className="space-y-4">
                <div>
                  <input
                    type="tel"
                    value={settings.phone}
                    onChange={(e) => setSettings(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder="05X-XXX-XXXX"
                    className="w-full h-11 px-4 rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    dir="ltr"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    הזינו מספר טלפון ישראלי
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-foreground">קבלת הודעות WhatsApp</p>
                    <p className="text-sm text-muted-foreground">אפשרו קבלת סיכומים והתראות</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.wa_opt_in}
                      onChange={(e) => setSettings(prev => ({ ...prev, wa_opt_in: e.target.checked }))}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-muted rounded-full peer peer-checked:bg-primary after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5"></div>
                  </label>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Google Calendar Connection */}
      <div id="calendar" className="bg-white rounded-xl border p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
            calendarConnection?.is_active ? 'bg-green-100' : 'bg-orange-100'
          }`}>
            <Calendar className={`w-5 h-5 ${
              calendarConnection?.is_active ? 'text-green-600' : 'text-orange-600'
            }`} />
          </div>
          <div>
            <h2 className="text-lg font-semibold">חיבור Google Calendar</h2>
            <p className="text-sm text-muted-foreground">
              סנכרון אירועים מהקבוצות ליומן שלך
            </p>
          </div>
        </div>

        {calendarConnection?.is_active ? (
          <div className="space-y-4">
            <div className="bg-green-50 rounded-lg p-4">
              <div className="flex items-center gap-2 text-green-800">
                <Check className="w-5 h-5" />
                <p className="font-medium">היומן מחובר ופעיל</p>
              </div>
              <p className="text-green-700 text-sm mt-1">
                אירועים שזוהו בקבוצות ישלחו אליך לאישור בוואטסאפ לפני הוספה ליומן.
              </p>
              <p className="text-green-600 text-xs mt-2">
                חובר בתאריך: {new Date(calendarConnection.created_at).toLocaleDateString('he-IL')}
              </p>
            </div>
            
            <button
              onClick={disconnectGoogleCalendar}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-red-200"
            >
              <X className="w-4 h-4" />
              נתק חיבור יומן
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-foreground text-sm mb-2">
                <strong>איך זה עובד?</strong>
              </p>
              <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                <li>המערכת מזהה אירועים בהודעות (פגישות, אסיפות, טיולים...)</li>
                <li>נשלח לך הודעה בוואטסאפ עם פרטי האירוע</li>
                <li>השב "כן" כדי להוסיף ליומן או "לא" לדחות</li>
                <li>האירוע מתווסף אוטומטית ליומן Google שלך</li>
              </ol>
            </div>
            
            <button
              onClick={connectGoogleCalendar}
              disabled={isConnectingCalendar}
              className="w-full py-3 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              {isConnectingCalendar ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <ExternalLink className="w-5 h-5" />
                  חבר Google Calendar
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Notification Settings */}
      <div className="bg-white rounded-xl border p-6 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
            <Bell className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">הגדרות התראות</h2>
            <p className="text-sm text-muted-foreground">שליטה בהתראות וסיכומים</p>
          </div>
        </div>

        {/* Daily summary */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-foreground">סיכום יומי</p>
              <p className="text-sm text-muted-foreground">קבלו סיכום של כל ההודעות החשובות</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.notification_settings.daily_summary_enabled}
                onChange={(e) => setSettings(prev => ({
                  ...prev,
                  notification_settings: {
                    ...prev.notification_settings,
                    daily_summary_enabled: e.target.checked
                  }
                }))}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-muted rounded-full peer peer-checked:bg-primary after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5"></div>
            </label>
          </div>

          {settings.notification_settings.daily_summary_enabled && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                שעת שליחה
              </label>
              <div className="relative w-40">
                <Clock className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  type="time"
                  value={settings.daily_summary_time}
                  onChange={(e) => setSettings(prev => ({ ...prev, daily_summary_time: e.target.value }))}
                  className="w-full h-11 pr-10 pl-4 rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
          )}
        </div>

        {/* Immediate alerts */}
        <div className="flex items-center justify-between pt-4 border-t">
          <div>
            <p className="font-medium text-foreground">התראות מיידיות</p>
            <p className="text-sm text-muted-foreground">קבלו התראה על שינויים דחופים</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={settings.notification_settings.immediate_alerts_enabled}
              onChange={(e) => setSettings(prev => ({
                ...prev,
                notification_settings: {
                  ...prev.notification_settings,
                  immediate_alerts_enabled: e.target.checked
                }
              }))}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-muted rounded-full peer peer-checked:bg-primary after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5"></div>
          </label>
        </div>

        {/* Quiet hours */}
        <div className="pt-4 border-t">
          <p className="font-medium text-foreground mb-3">שעות שקט</p>
          <p className="text-sm text-muted-foreground mb-4">לא נשלח התראות בין השעות הבאות</p>
          <div className="flex items-center gap-4">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">מ-</label>
              <input
                type="time"
                value={settings.notification_settings.quiet_hours_start}
                onChange={(e) => setSettings(prev => ({
                  ...prev,
                  notification_settings: {
                    ...prev.notification_settings,
                    quiet_hours_start: e.target.value
                  }
                }))}
                className="h-10 px-3 rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">עד</label>
              <input
                type="time"
                value={settings.notification_settings.quiet_hours_end}
                onChange={(e) => setSettings(prev => ({
                  ...prev,
                  notification_settings: {
                    ...prev.notification_settings,
                    quiet_hours_end: e.target.value
                  }
                }))}
                className="h-10 px-3 rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Save button */}
      <div className="flex items-center justify-between">
        {message && (
          <p className={`text-sm ${message.includes('שגיאה') ? 'text-destructive' : 'text-green-600'}`}>
            {message}
          </p>
        )}
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="mr-auto inline-flex items-center gap-2 bg-primary text-white px-6 py-2.5 rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {isSaving ? (
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            <>
              <Save className="w-4 h-4" />
              שמור הגדרות
            </>
          )}
        </button>
      </div>
    </div>
  );
}

