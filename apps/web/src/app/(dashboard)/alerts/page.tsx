'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Bell, CheckCircle, Clock, AlertTriangle, Trash2 } from 'lucide-react';

interface Alert {
  id: string;
  content: string;
  sent: boolean;
  sent_at: string | null;
  created_at: string;
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    loadAlerts();
  }, []);

  const loadAlerts = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) return;

    const { data } = await supabase
      .from('alerts')
      .select('*')
      .eq('user_id', user.id)
      .eq('sent', false)
      .order('created_at', { ascending: false });

    setAlerts(data || []);
    setIsLoading(false);
  };

  const markAsSent = async (alertId: string) => {
    const supabase = createClient();
    
    await supabase
      .from('alerts')
      .update({ sent: true, sent_at: new Date().toISOString() })
      .eq('id', alertId);

    // Remove from list immediately
    setAlerts(prev => prev.filter(a => a.id !== alertId));
    
    // Notify header to update
    window.dispatchEvent(new CustomEvent('alerts-updated'));
    router.refresh();
  };

  const deleteAlert = async (alertId: string) => {
    const supabase = createClient();
    
    await supabase
      .from('alerts')
      .delete()
      .eq('id', alertId);

    setAlerts(prev => prev.filter(a => a.id !== alertId));
    
    // Notify header to update
    window.dispatchEvent(new CustomEvent('alerts-updated'));
    router.refresh();
  };

  const markAllAsSent = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) return;

    await supabase
      .from('alerts')
      .update({ sent: true, sent_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('sent', false);

    // Clear all alerts from list
    setAlerts([]);
    
    // Notify header to update
    window.dispatchEvent(new CustomEvent('alerts-updated'));
    router.refresh();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">התראות</h1>
          <p className="text-muted-foreground">כל ההתראות והעדכונים הדחופים</p>
        </div>
        {alerts.length > 0 && (
          <button
            onClick={markAllAsSent}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
          >
            <CheckCircle className="w-4 h-4" />
            סמן הכל כנקרא
          </button>
        )}
      </div>

      {/* Pending Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-yellow-500" />
            {alerts.length} התראות
          </h2>
          <div className="space-y-3">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className="bg-yellow-50 border border-yellow-200 rounded-xl p-4"
              >
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center flex-shrink-0">
                    <Bell className="w-5 h-5 text-yellow-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-foreground whitespace-pre-wrap">{alert.content}</p>
                    <p className="text-xs text-muted-foreground mt-2">
                      <Clock className="w-3 h-3 inline-block ml-1" />
                      {new Date(alert.created_at).toLocaleString('he-IL', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => markAsSent(alert.id)}
                      className="p-2 text-green-600 hover:bg-green-100 rounded-lg transition-colors"
                      title="סמן כנקרא"
                    >
                      <CheckCircle className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => deleteAlert(alert.id)}
                      className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                      title="מחק"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {alerts.length === 0 && (
        <div className="text-center py-12">
          <Bell className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">אין התראות</h3>
          <p className="text-muted-foreground">
            כאשר יזוהו דברים דחופים בקבוצות, הם יופיעו כאן
          </p>
        </div>
      )}
    </div>
  );
}

