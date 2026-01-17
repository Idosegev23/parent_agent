import { createClient } from '@/lib/supabase/server';
import { FileText, Calendar } from 'lucide-react';

export default async function HistoryPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  // Get all digests
  const { data: digests } = await supabase
    .from('digests')
    .select('*')
    .eq('user_id', user.id)
    .order('digest_date', { ascending: false })
    .limit(30);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">היסטוריית סיכומים</h1>
        <p className="text-muted-foreground">כל הסיכומים היומיים שנשלחו</p>
      </div>

      {/* Digests list */}
      {digests && digests.length > 0 ? (
        <div className="space-y-4">
          {digests.map((digest) => (
            <DigestCard key={digest.id} digest={digest} />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border p-12 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
            <FileText className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">
            עדיין אין סיכומים
          </h3>
          <p className="text-muted-foreground">
            הסיכום הראשון יישלח אליכם בערב, לאחר שתחברו את WhatsApp
          </p>
        </div>
      )}
    </div>
  );
}

function DigestCard({ 
  digest 
}: { 
  digest: {
    id: string;
    digest_date: string;
    content: string;
    items_count: number;
    sent_at: string | null;
  };
}) {
  const date = new Date(digest.digest_date);
  
  return (
    <div className="bg-white rounded-xl border p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
            <Calendar className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">
              {date.toLocaleDateString('he-IL', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </h3>
            <p className="text-sm text-muted-foreground">
              {digest.items_count} פריטים
              {digest.sent_at && (
                <> • נשלח ב-{new Date(digest.sent_at).toLocaleTimeString('he-IL', {
                  hour: '2-digit',
                  minute: '2-digit'
                })}</>
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="prose prose-sm max-w-none">
        <div className="whitespace-pre-wrap text-foreground bg-muted/50 rounded-lg p-4">
          {digest.content}
        </div>
      </div>
    </div>
  );
}




