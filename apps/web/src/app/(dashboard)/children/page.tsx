import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { Plus, User, MoreVertical } from 'lucide-react';

export default async function ChildrenPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: children } = await supabase
    .from('children')
    .select(`
      *,
      groups:groups(id, name, type),
      activities:activities(id, name)
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">הילדים שלי</h1>
          <p className="text-muted-foreground">ניהול ילדים וקבוצות WhatsApp משויכות</p>
        </div>
        <Link
          href="/children/new"
          className="inline-flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-5 h-5" />
          הוסף ילד
        </Link>
      </div>

      {/* Children list */}
      {children && children.length > 0 ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {children.map((child) => (
            <ChildCard key={child.id} child={child} />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border p-12 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">
            עדיין אין ילדים
          </h3>
          <p className="text-muted-foreground mb-6">
            הוסיפו את הילדים שלכם כדי להתחיל לקבל סיכומים מהקבוצות שלהם
          </p>
          <Link
            href="/children/new"
            className="inline-flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-5 h-5" />
            הוסף ילד ראשון
          </Link>
        </div>
      )}
    </div>
  );
}

function ChildCard({ 
  child 
}: { 
  child: {
    id: string;
    name: string;
    birth_date: string | null;
    groups: { id: string; name: string; type: string }[];
    activities: { id: string; name: string }[];
  };
}) {
  const age = child.birth_date 
    ? Math.floor((Date.now() - new Date(child.birth_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : null;

  return (
    <div className="bg-white rounded-xl border p-6 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-xl font-bold text-primary">
              {child.name[0]}
            </span>
          </div>
          <div>
            <h3 className="font-semibold text-foreground">{child.name}</h3>
            {age !== null && (
              <p className="text-sm text-muted-foreground">גיל {age}</p>
            )}
          </div>
        </div>
        <Link 
          href={`/children/${child.id}`}
          className="p-2 hover:bg-muted rounded-lg transition-colors"
        >
          <MoreVertical className="w-5 h-5 text-muted-foreground" />
        </Link>
      </div>

      {/* Groups */}
      <div className="space-y-2 mb-4">
        <p className="text-sm font-medium text-foreground">
          קבוצות ({child.groups?.length || 0})
        </p>
        {child.groups && child.groups.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {child.groups.slice(0, 3).map((group) => (
              <span 
                key={group.id}
                className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700"
              >
                {group.name}
              </span>
            ))}
            {child.groups.length > 3 && (
              <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground">
                +{child.groups.length - 3}
              </span>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">אין קבוצות משויכות</p>
        )}
      </div>

      {/* Activities */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">
          חוגים ({child.activities?.length || 0})
        </p>
        {child.activities && child.activities.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {child.activities.slice(0, 3).map((activity) => (
              <span 
                key={activity.id}
                className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700"
              >
                {activity.name}
              </span>
            ))}
            {child.activities.length > 3 && (
              <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground">
                +{child.activities.length - 3}
              </span>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">אין חוגים</p>
        )}
      </div>

      <Link
        href={`/children/${child.id}`}
        className="block mt-4 text-center text-sm text-primary hover:underline"
      >
        ערוך פרטים
      </Link>
    </div>
  );
}




