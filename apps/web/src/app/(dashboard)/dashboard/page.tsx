import { createClient } from '@/lib/supabase/server';
import { 
  MessageSquare, 
  Users, 
  Bell, 
  CheckCircle2,
  AlertTriangle,
  Wifi,
  WifiOff
} from 'lucide-react';
import Link from 'next/link';
import { GenerateDigestButton } from '@/components/generate-digest-button';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  // Fetch dashboard data
  const [
    { data: waSession },
    { data: children },
    { data: recentItems },
    { data: latestDigest },
    { data: pendingAlerts }
  ] = await Promise.all([
    supabase.from('wa_sessions').select('status, last_heartbeat').eq('user_id', user.id).single(),
    supabase.from('children').select('id, name').eq('user_id', user.id),
    supabase.from('extracted_items')
      .select('id, category, urgency, summary, created_at, child_id')
      .order('created_at', { ascending: false })
      .limit(5),
    supabase.from('digests')
      .select('content, digest_date, items_count')
      .eq('user_id', user.id)
      .order('digest_date', { ascending: false })
      .limit(1)
      .single(),
    supabase.from('alerts')
      .select('id')
      .eq('user_id', user.id)
      .eq('sent', false)
  ]);

  const isConnected = waSession?.status === 'connected';
  const needsQr = waSession?.status === 'qr_required';

  return (
    <div className="space-y-6">
      {/* Page title */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">שלום, {user.user_metadata?.full_name?.split(' ')[0] || 'הורה יקר'}</h1>
        <p className="text-muted-foreground">הנה הסיכום שלך להיום</p>
      </div>

      {/* Connection status alert */}
      {!isConnected && (
        <div className={`p-4 rounded-lg border ${needsQr ? 'bg-yellow-50 border-yellow-200' : 'bg-red-50 border-red-200'}`}>
          <div className="flex items-center gap-3">
            {needsQr ? (
              <AlertTriangle className="w-5 h-5 text-yellow-600" />
            ) : (
              <WifiOff className="w-5 h-5 text-red-600" />
            )}
            <div className="flex-1">
              <p className={`font-medium ${needsQr ? 'text-yellow-800' : 'text-red-800'}`}>
                {needsQr ? 'נדרש חיבור מחדש' : 'WhatsApp לא מחובר'}
              </p>
              <p className={`text-sm ${needsQr ? 'text-yellow-700' : 'text-red-700'}`}>
                {needsQr 
                  ? 'יש לסרוק קוד QR כדי להמשיך לקבל הודעות' 
                  : 'המערכת לא יכולה לקרוא הודעות מקבוצות'}
              </p>
            </div>
            <Link 
              href="/settings#whatsapp" 
              className={`px-4 py-2 rounded-lg text-sm font-medium ${
                needsQr 
                  ? 'bg-yellow-600 text-white hover:bg-yellow-700' 
                  : 'bg-red-600 text-white hover:bg-red-700'
              }`}
            >
              חיבור
            </Link>
          </div>
        </div>
      )}

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Wifi className="w-5 h-5" />}
          label="סטטוס חיבור"
          value={isConnected ? 'מחובר' : 'לא מחובר'}
          color={isConnected ? 'green' : 'red'}
        />
        <StatCard
          icon={<Users className="w-5 h-5" />}
          label="ילדים"
          value={children?.length || 0}
          color="blue"
        />
        <Link href="/alerts">
          <StatCard
            icon={<Bell className="w-5 h-5" />}
            label="התראות ממתינות"
            value={pendingAlerts?.length || 0}
            color="yellow"
            clickable
          />
        </Link>
        <StatCard
          icon={<MessageSquare className="w-5 h-5" />}
          label="פריטים בסיכום האחרון"
          value={latestDigest?.items_count || 0}
          color="purple"
        />
      </div>

      {/* Main content grid */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Latest digest */}
        <div className="bg-white rounded-xl border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">הסיכום האחרון</h2>
            <Link href="/history" className="text-sm text-primary hover:underline">
              כל הסיכומים
            </Link>
          </div>
          {latestDigest ? (
            <div className="prose prose-sm max-w-none">
              <p className="text-sm text-muted-foreground mb-2">
                {new Date(latestDigest.digest_date).toLocaleDateString('he-IL', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </p>
              <div className="whitespace-pre-wrap text-foreground">
                {latestDigest.content}
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8">
              אין סיכומים עדיין. הסיכום הראשון יישלח בערב.
            </p>
          )}
          <div className="mt-4 pt-4 border-t">
            <GenerateDigestButton />
          </div>
        </div>

        {/* Recent items */}
        <div className="bg-white rounded-xl border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">פריטים אחרונים</h2>
          </div>
          {recentItems && recentItems.length > 0 ? (
            <div className="space-y-3">
              {recentItems.map((item) => (
                <div key={item.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                  <div className={`w-2 h-2 mt-2 rounded-full ${
                    item.urgency >= 7 ? 'bg-red-500' : 
                    item.urgency >= 4 ? 'bg-yellow-500' : 'bg-green-500'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground">{item.summary}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {getCategoryLabel(item.category)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8">
              אין פריטים חדשים
            </p>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div className="bg-white rounded-xl border p-6">
        <h2 className="text-lg font-semibold mb-4">פעולות מהירות</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <QuickAction href="/children/new" icon={<Users />} label="הוסף ילד" />
          <QuickAction href="/activities/new" icon={<CheckCircle2 />} label="הוסף חוג" />
          <QuickAction href="/calendar" icon={<MessageSquare />} label="לוח שנה" />
          <QuickAction href="/settings" icon={<Bell />} label="הגדרות התראות" />
        </div>
      </div>
    </div>
  );
}

function StatCard({ 
  icon, 
  label, 
  value, 
  color,
  clickable = false
}: { 
  icon: React.ReactNode; 
  label: string; 
  value: string | number;
  color: 'green' | 'red' | 'blue' | 'yellow' | 'purple';
  clickable?: boolean;
}) {
  const colors = {
    green: 'bg-green-100 text-green-700',
    red: 'bg-red-100 text-red-700',
    blue: 'bg-blue-100 text-blue-700',
    yellow: 'bg-yellow-100 text-yellow-700',
    purple: 'bg-purple-100 text-purple-700'
  };

  return (
    <div className={`bg-white rounded-xl border p-4 ${clickable ? 'hover:shadow-md hover:border-primary/50 transition-all cursor-pointer' : ''}`}>
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

function QuickAction({ 
  href, 
  icon, 
  label 
}: { 
  href: string; 
  icon: React.ReactNode; 
  label: string; 
}) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-2 p-4 rounded-lg border-2 border-dashed border-muted hover:border-primary hover:bg-primary/5 transition-colors"
    >
      <div className="text-muted-foreground">{icon}</div>
      <span className="text-sm text-foreground">{label}</span>
    </Link>
  );
}

function getCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    equipment: 'ציוד',
    food: 'אוכל',
    event: 'אירוע',
    schedule_change: 'שינוי לוח זמנים',
    parent_request: 'בקשה מהורים',
    teacher_message: 'הודעת מורה',
    study_material: 'חומר לימודי',
    activity: 'חוג',
    noise: 'כללי'
  };
  return labels[category] || category;
}

