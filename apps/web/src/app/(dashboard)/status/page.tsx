'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { 
  Wifi, 
  WifiOff, 
  RefreshCw, 
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  MessageSquare,
  AlertCircle
} from 'lucide-react';

interface ScanRequest {
  id: string;
  status: string;
  messages_found: number;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
  groups: { name: string };
}

interface ExtractedItem {
  id: string;
  category: string;
  urgency: number;
  summary: string;
  created_at: string;
  message_date: string | null;
  children: { name: string };
}

interface WaSession {
  status: string;
  last_heartbeat: string;
}

export default function StatusPage() {
  const [session, setSession] = useState<WaSession | null>(null);
  const [scanRequests, setScanRequests] = useState<ScanRequest[]>([]);
  const [recentItems, setRecentItems] = useState<ExtractedItem[]>([]);
  const [rawMessagesCount, setRawMessagesCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000); // Auto-refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [
      { data: sessionData },
      { data: scansData },
      { data: itemsData },
      { count: messagesCount }
    ] = await Promise.all([
      supabase
        .from('wa_sessions')
        .select('status, last_heartbeat')
        .eq('user_id', user.id)
        .single(),
      supabase
        .from('scan_requests')
        .select('*, groups(name)')
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('extracted_items')
        .select('*, children(name)')
        .order('message_date', { ascending: false, nullsFirst: false })
        .limit(20),
      supabase
        .from('wa_raw_messages')
        .select('id', { count: 'exact', head: true })
    ]);

    setSession(sessionData);
    setScanRequests(scansData || []);
    setRecentItems(itemsData || []);
    setRawMessagesCount(messagesCount || 0);
    setIsLoading(false);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'failed': return <XCircle className="w-4 h-4 text-red-600" />;
      case 'processing': return <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />;
      default: return <Clock className="w-4 h-4 text-yellow-600" />;
    }
  };

  const getCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      equipment: 'ציוד',
      food: 'אוכל',
      event: 'אירוע',
      schedule_change: 'שינוי לוז',
      parent_request: 'בקשה',
      teacher_message: 'מורה',
      study_material: 'לימודים',
      activity: 'חוג',
      noise: 'כללי'
    };
    return labels[category] || category;
  };

  const formatTime = (date: string) => {
    return new Date(date).toLocaleString('he-IL', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit'
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">סטטוס מערכת</h1>
          <p className="text-muted-foreground">מעקב אחר סריקות ועיבוד הודעות</p>
        </div>
        <button
          onClick={loadData}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
        >
          <RefreshCw className="w-4 h-4" />
          רענן
        </button>
      </div>

      {/* Connection Status */}
      <div className={`rounded-xl border p-6 ${
        session?.status === 'connected' 
          ? 'bg-green-50 border-green-200' 
          : 'bg-red-50 border-red-200'
      }`}>
        <div className="flex items-center gap-4">
          {session?.status === 'connected' ? (
            <Wifi className="w-8 h-8 text-green-600" />
          ) : (
            <WifiOff className="w-8 h-8 text-red-600" />
          )}
          <div>
            <h2 className="text-lg font-semibold">
              WhatsApp: {session?.status === 'connected' ? 'מחובר' : session?.status || 'לא ידוע'}
            </h2>
            {session?.last_heartbeat && (
              <p className="text-sm text-muted-foreground">
                פעימה אחרונה: {formatTime(session.last_heartbeat)}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border p-4 text-center">
          <p className="text-3xl font-bold text-primary">{rawMessagesCount}</p>
          <p className="text-sm text-muted-foreground">הודעות גולמיות</p>
        </div>
        <div className="bg-white rounded-xl border p-4 text-center">
          <p className="text-3xl font-bold text-green-600">{recentItems.length}</p>
          <p className="text-sm text-muted-foreground">פריטים מעובדים</p>
        </div>
        <div className="bg-white rounded-xl border p-4 text-center">
          <p className="text-3xl font-bold text-blue-600">
            {scanRequests.filter(s => s.status === 'completed').length}
          </p>
          <p className="text-sm text-muted-foreground">סריקות הושלמו</p>
        </div>
        <div className="bg-white rounded-xl border p-4 text-center">
          <p className="text-3xl font-bold text-yellow-600">
            {scanRequests.filter(s => s.status === 'pending' || s.status === 'processing').length}
          </p>
          <p className="text-sm text-muted-foreground">סריקות בהמתנה</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Scan Requests */}
        <div className="bg-white rounded-xl border p-6">
          <h2 className="text-lg font-semibold mb-4">היסטוריית סריקות</h2>
          {scanRequests.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              אין סריקות עדיין
            </p>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {scanRequests.map((scan) => (
                <div 
                  key={scan.id} 
                  className={`p-3 rounded-lg border ${
                    scan.status === 'completed' ? 'bg-green-50 border-green-200' :
                    scan.status === 'failed' ? 'bg-red-50 border-red-200' :
                    scan.status === 'processing' ? 'bg-blue-50 border-blue-200' :
                    'bg-yellow-50 border-yellow-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {getStatusIcon(scan.status)}
                    <span className="font-medium flex-1 truncate">
                      {scan.groups?.name || 'קבוצה לא ידועה'}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatTime(scan.created_at)}
                    </span>
                  </div>
                  {scan.status === 'completed' && (
                    <p className="text-sm text-green-700 mt-1">
                      נמצאו {scan.messages_found} הודעות
                    </p>
                  )}
                  {scan.status === 'failed' && scan.error_message && (
                    <p className="text-sm text-red-700 mt-1">
                      {scan.error_message}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Extracted Items */}
        <div className="bg-white rounded-xl border p-6">
          <h2 className="text-lg font-semibold mb-4">פריטים אחרונים שזוהו</h2>
          {recentItems.length === 0 ? (
            <div className="text-center py-8">
              <AlertCircle className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
              <p className="text-muted-foreground">
                אין פריטים מעובדים עדיין
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                סרוק קבוצות כדי לראות פריטים כאן
              </p>
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {recentItems.map((item) => (
                <div key={item.id} className="p-3 rounded-lg bg-muted/50">
                  <div className="flex items-start gap-2">
                    <div className={`w-2 h-2 mt-2 rounded-full ${
                      item.urgency >= 7 ? 'bg-red-500' :
                      item.urgency >= 4 ? 'bg-yellow-500' : 'bg-green-500'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground">{item.summary}</p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <span className="bg-primary/10 text-primary px-2 py-0.5 rounded">
                          {getCategoryLabel(item.category)}
                        </span>
                        <span>{item.children?.name}</span>
                        {item.message_date && (
                          <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded">
                            {formatTime(item.message_date)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

