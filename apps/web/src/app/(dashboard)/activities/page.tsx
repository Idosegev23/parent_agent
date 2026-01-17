import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { Plus, Activity, Clock, MapPin, Phone } from 'lucide-react';

export default async function ActivitiesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  // Get children with their activities
  const { data: children } = await supabase
    .from('children')
    .select(`
      id,
      name,
      activities:activities(
        id,
        name,
        schedule,
        address,
        instructor_name,
        instructor_phone,
        activity_requirements(id, category, description)
      )
    `)
    .eq('user_id', user.id);

  const allActivities = children?.flatMap(child => 
    child.activities?.map(activity => ({ ...activity, childName: child.name })) || []
  ) || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">חוגים ופעילויות</h1>
          <p className="text-muted-foreground">ניהול חוגים וזמני פעילות</p>
        </div>
        <Link
          href="/activities/new"
          className="inline-flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-5 h-5" />
          הוסף חוג
        </Link>
      </div>

      {/* Activities list */}
      {allActivities.length > 0 ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {allActivities.map((activity) => (
            <ActivityCard key={activity.id} activity={activity} />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border p-12 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
            <Activity className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">
            עדיין אין חוגים
          </h3>
          <p className="text-muted-foreground mb-6">
            הוסיפו חוגים ופעילויות כדי לעקוב אחרי הלוח זמנים
          </p>
          <Link
            href="/activities/new"
            className="inline-flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-5 h-5" />
            הוסף חוג ראשון
          </Link>
        </div>
      )}
    </div>
  );
}

function ActivityCard({ 
  activity 
}: { 
  activity: {
    id: string;
    name: string;
    childName: string;
    schedule: { day: string; start_time: string; end_time: string }[];
    address: string | null;
    instructor_name: string | null;
    instructor_phone: string | null;
    activity_requirements: { id: string; category: string; description: string }[];
  };
}) {
  const dayNames: Record<string, string> = {
    sunday: 'ראשון',
    monday: 'שני',
    tuesday: 'שלישי',
    wednesday: 'רביעי',
    thursday: 'חמישי',
    friday: 'שישי',
    saturday: 'שבת'
  };

  return (
    <div className="bg-white rounded-xl border p-6 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-semibold text-foreground">{activity.name}</h3>
          <p className="text-sm text-muted-foreground">{activity.childName}</p>
        </div>
        <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
          <Activity className="w-5 h-5 text-green-600" />
        </div>
      </div>

      {/* Schedule */}
      {activity.schedule && activity.schedule.length > 0 && (
        <div className="flex items-start gap-2 mb-3">
          <Clock className="w-4 h-4 text-muted-foreground mt-0.5" />
          <div className="text-sm">
            {activity.schedule.map((slot, i) => (
              <div key={i}>
                יום {dayNames[slot.day] || slot.day}: {slot.start_time} - {slot.end_time}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Address */}
      {activity.address && (
        <div className="flex items-start gap-2 mb-3">
          <MapPin className="w-4 h-4 text-muted-foreground mt-0.5" />
          <span className="text-sm text-foreground">{activity.address}</span>
        </div>
      )}

      {/* Instructor */}
      {activity.instructor_phone && (
        <div className="flex items-start gap-2 mb-3">
          <Phone className="w-4 h-4 text-muted-foreground mt-0.5" />
          <span className="text-sm text-foreground">
            {activity.instructor_name || 'מדריך'}: {activity.instructor_phone}
          </span>
        </div>
      )}

      {/* Requirements */}
      {activity.activity_requirements && activity.activity_requirements.length > 0 && (
        <div className="mt-4 pt-4 border-t">
          <p className="text-xs font-medium text-muted-foreground mb-2">דרישות קבועות:</p>
          <div className="flex flex-wrap gap-1">
            {activity.activity_requirements.map((req) => (
              <span 
                key={req.id}
                className="text-xs px-2 py-1 rounded-full bg-muted text-foreground"
              >
                {req.description}
              </span>
            ))}
          </div>
        </div>
      )}

      <Link
        href={`/activities/${activity.id}`}
        className="block mt-4 text-center text-sm text-primary hover:underline"
      >
        ערוך פרטים
      </Link>
    </div>
  );
}




