'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { LogOut, Bell } from 'lucide-react';
import { WaStatusIndicator } from './wa-status-indicator';

interface HeaderProps {
  user: {
    full_name: string | null;
    email: string;
  } | null;
}

export function Header({ user }: HeaderProps) {
  const router = useRouter();
  const [alertCount, setAlertCount] = useState(0);

  useEffect(() => {
    loadAlertCount();
    
    // Refresh every 10 seconds for faster updates
    const interval = setInterval(loadAlertCount, 10000);
    
    // Listen for custom event when alerts are updated
    const handleAlertsUpdate = () => {
      loadAlertCount();
    };
    window.addEventListener('alerts-updated', handleAlertsUpdate);
    
    // Refresh when tab becomes visible
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        loadAlertCount();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    
    // Refresh when window gets focus
    const handleFocus = () => loadAlertCount();
    window.addEventListener('focus', handleFocus);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('alerts-updated', handleAlertsUpdate);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  const loadAlertCount = async () => {
    const supabase = createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    
    if (!authUser) return;

    const { count } = await supabase
      .from('alerts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', authUser.id)
      .eq('sent', false);

    setAlertCount(count || 0);
  };

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-sm border-b">
      <div className="flex items-center justify-between h-16 px-4 lg:px-6">
        {/* Page title - will be set by each page */}
        <div className="lg:mr-0 mr-12" />

        {/* Actions */}
        <div className="flex items-center gap-3">
          {/* WhatsApp Status */}
          <Link href="/settings#whatsapp" className="hidden sm:block">
            <WaStatusIndicator showLabel={false} />
          </Link>
          <Link href="/settings#whatsapp" className="sm:hidden">
            <WaStatusIndicator compact />
          </Link>

          {/* Notifications */}
          <Link 
            href="/alerts"
            className="relative p-2 rounded-lg hover:bg-muted transition-colors"
          >
            <Bell className="w-5 h-5 text-muted-foreground" />
            {alertCount > 0 && (
              <span className="absolute -top-1 -left-1 min-w-[20px] h-5 flex items-center justify-center bg-destructive text-white text-xs font-medium rounded-full px-1">
                {alertCount > 99 ? '99+' : alertCount}
              </span>
            )}
          </Link>

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">התנתקות</span>
          </button>
        </div>
      </div>
    </header>
  );
}
