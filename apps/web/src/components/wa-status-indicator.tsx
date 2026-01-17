'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Wifi, WifiOff, Loader2, AlertTriangle } from 'lucide-react';

interface WaStatusIndicatorProps {
  compact?: boolean;
  showLabel?: boolean;
}

type SessionStatus = 'connected' | 'disconnected' | 'connecting' | 'qr_required' | 'unstable' | 'manual_reauth_required';

const statusConfig: Record<SessionStatus, { color: string; bgColor: string; label: string; Icon: typeof Wifi }> = {
  connected: { color: 'text-green-600', bgColor: 'bg-green-100', label: 'מחובר', Icon: Wifi },
  disconnected: { color: 'text-red-600', bgColor: 'bg-red-100', label: 'מנותק', Icon: WifiOff },
  connecting: { color: 'text-blue-600', bgColor: 'bg-blue-100', label: 'מתחבר...', Icon: Loader2 },
  qr_required: { color: 'text-orange-600', bgColor: 'bg-orange-100', label: 'דורש סריקה', Icon: AlertTriangle },
  unstable: { color: 'text-yellow-600', bgColor: 'bg-yellow-100', label: 'לא יציב', Icon: AlertTriangle },
  manual_reauth_required: { color: 'text-red-600', bgColor: 'bg-red-100', label: 'דורש חיבור מחדש', Icon: WifiOff }
};

export function WaStatusIndicator({ compact = false, showLabel = true }: WaStatusIndicatorProps) {
  const [status, setStatus] = useState<SessionStatus | null>(null);
  const [lastHeartbeat, setLastHeartbeat] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();

    const loadStatus = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: session } = await supabase
        .from('wa_sessions')
        .select('status, last_heartbeat')
        .eq('user_id', user.id)
        .single();

      if (session) {
        setStatus(session.status as SessionStatus);
        setLastHeartbeat(session.last_heartbeat);
      }
    };

    loadStatus();

    // Subscribe to real-time updates
    const setupSubscription = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const channel = supabase
        .channel('wa_status_indicator')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'wa_sessions',
            filter: `user_id=eq.${user.id}`
          },
          (payload) => {
            if (payload.new) {
              const newData = payload.new as { status: SessionStatus; last_heartbeat: string };
              setStatus(newData.status);
              setLastHeartbeat(newData.last_heartbeat);
            }
          }
        )
        .subscribe();

      return channel;
    };

    let channel: ReturnType<typeof supabase.channel> | null = null;
    setupSubscription().then(ch => { channel = ch; });

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, []);

  if (!status) {
    return null;
  }

  const config = statusConfig[status] || statusConfig.disconnected;
  const { color, bgColor, label, Icon } = config;
  const isAnimated = status === 'connecting';

  // Check if heartbeat is stale (more than 2 minutes old)
  const isStale = lastHeartbeat && 
    new Date().getTime() - new Date(lastHeartbeat).getTime() > 2 * 60 * 1000;

  if (compact) {
    return (
      <div 
        className={`w-3 h-3 rounded-full ${status === 'connected' && !isStale ? 'bg-green-500' : 'bg-red-500'}`}
        title={`WhatsApp: ${label}`}
      />
    );
  }

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full ${bgColor}`}>
      <Icon className={`w-4 h-4 ${color} ${isAnimated ? 'animate-spin' : ''}`} />
      {showLabel && (
        <span className={`text-sm font-medium ${color}`}>
          {isStale && status === 'connected' ? 'לא יציב' : label}
        </span>
      )}
    </div>
  );
}

export default WaStatusIndicator;
