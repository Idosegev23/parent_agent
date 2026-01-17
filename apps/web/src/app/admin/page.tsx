import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { 
  Users, 
  Wifi, 
  WifiOff, 
  AlertTriangle,
  CheckCircle,
  Clock
} from 'lucide-react';

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Check if user is admin
  const { data: userData } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!userData?.is_admin) {
    redirect('/dashboard');
  }

  // Get system stats
  const [
    { count: totalUsers },
    { data: sessions },
    { count: totalMessages },
    { count: totalAlerts }
  ] = await Promise.all([
    supabase.from('users').select('*', { count: 'exact', head: true }),
    supabase.from('wa_sessions').select('user_id, status, last_heartbeat'),
    supabase.from('wa_raw_messages').select('*', { count: 'exact', head: true }),
    supabase.from('alerts').select('*', { count: 'exact', head: true }).eq('sent', false)
  ]);

  const connectedCount = sessions?.filter(s => s.status === 'connected').length || 0;
  const needsReauthCount = sessions?.filter(s => 
    s.status === 'qr_required' || s.status === 'manual_reauth_required'
  ).length || 0;

  return (
    <div className="min-h-screen bg-muted/30 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">לוח בקרה - מנהל</h1>
          <p className="text-muted-foreground">סקירת מצב המערכת</p>
        </div>

        {/* Stats */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={<Users className="w-5 h-5" />}
            label="משתמשים"
            value={totalUsers || 0}
            color="blue"
          />
          <StatCard
            icon={<Wifi className="w-5 h-5" />}
            label="מחוברים"
            value={connectedCount}
            color="green"
          />
          <StatCard
            icon={<AlertTriangle className="w-5 h-5" />}
            label="דורשים חיבור"
            value={needsReauthCount}
            color="yellow"
          />
          <StatCard
            icon={<Clock className="w-5 h-5" />}
            label="התראות ממתינות"
            value={totalAlerts || 0}
            color="red"
          />
        </div>

        {/* Users list */}
        <div className="bg-white rounded-xl border">
          <div className="p-4 border-b">
            <h2 className="text-lg font-semibold">סטטוס משתמשים</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-right p-3 text-sm font-medium text-muted-foreground">מזהה</th>
                  <th className="text-right p-3 text-sm font-medium text-muted-foreground">סטטוס</th>
                  <th className="text-right p-3 text-sm font-medium text-muted-foreground">עדכון אחרון</th>
                  <th className="text-right p-3 text-sm font-medium text-muted-foreground">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {sessions?.map((session) => (
                  <UserRow key={session.user_id} session={session} />
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* System info */}
        <div className="bg-white rounded-xl border p-6">
          <h2 className="text-lg font-semibold mb-4">מידע מערכת</h2>
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">סה"כ הודעות שנקראו</p>
              <p className="text-lg font-semibold">{totalMessages?.toLocaleString() || 0}</p>
            </div>
            <div>
              <p className="text-muted-foreground">גרסת מערכת</p>
              <p className="text-lg font-semibold">1.0.0</p>
            </div>
          </div>
        </div>

        {/* Note about privacy */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">
          <p className="font-medium">שימו לב - פרטיות</p>
          <p>למנהל אין גישה לתוכן הודעות או למידע רגיש של משתמשים. רק סטטוסים וסטטיסטיקות מוצגים.</p>
        </div>
      </div>
    </div>
  );
}

function StatCard({ 
  icon, 
  label, 
  value, 
  color 
}: { 
  icon: React.ReactNode; 
  label: string; 
  value: number;
  color: 'blue' | 'green' | 'yellow' | 'red';
}) {
  const colors = {
    blue: 'bg-blue-100 text-blue-700',
    green: 'bg-green-100 text-green-700',
    yellow: 'bg-yellow-100 text-yellow-700',
    red: 'bg-red-100 text-red-700'
  };

  return (
    <div className="bg-white rounded-xl border p-4">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colors[color]}`}>
          {icon}
        </div>
        <div>
          <p className="text-2xl font-bold text-foreground">{value}</p>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      </div>
    </div>
  );
}

function UserRow({ 
  session 
}: { 
  session: {
    user_id: string;
    status: string;
    last_heartbeat: string | null;
  };
}) {
  const statusColors: Record<string, { bg: string; text: string; label: string }> = {
    connected: { bg: 'bg-green-100', text: 'text-green-700', label: 'מחובר' },
    disconnected: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'מנותק' },
    connecting: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'מתחבר' },
    qr_required: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'דורש QR' },
    unstable: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'לא יציב' },
    manual_reauth_required: { bg: 'bg-red-100', text: 'text-red-700', label: 'דורש חיבור' }
  };

  const status = statusColors[session.status] || statusColors.disconnected;

  return (
    <tr className="border-t">
      <td className="p-3 text-sm font-mono text-muted-foreground">
        {session.user_id.substring(0, 8)}...
      </td>
      <td className="p-3">
        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${status.bg} ${status.text}`}>
          {session.status === 'connected' ? (
            <CheckCircle className="w-3 h-3" />
          ) : session.status === 'qr_required' || session.status === 'manual_reauth_required' ? (
            <AlertTriangle className="w-3 h-3" />
          ) : (
            <WifiOff className="w-3 h-3" />
          )}
          {status.label}
        </span>
      </td>
      <td className="p-3 text-sm text-muted-foreground">
        {session.last_heartbeat ? (
          new Date(session.last_heartbeat).toLocaleString('he-IL')
        ) : (
          '-'
        )}
      </td>
      <td className="p-3">
        <button className="text-sm text-primary hover:underline">
          שלח הודעת בדיקה
        </button>
      </td>
    </tr>
  );
}




