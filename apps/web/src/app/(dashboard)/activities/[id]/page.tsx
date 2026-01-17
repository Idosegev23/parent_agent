'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { 
  ArrowRight, 
  Save, 
  Trash2, 
  Plus, 
  X,
  Clock,
  MapPin,
  Phone,
  User,
  Loader2
} from 'lucide-react';
import Link from 'next/link';

interface Schedule {
  day: string;
  start_time: string;
  end_time: string;
}

interface Requirement {
  id?: string;
  category: string;
  description: string;
}

const DAYS = [
  { value: 'sunday', label: 'ראשון' },
  { value: 'monday', label: 'שני' },
  { value: 'tuesday', label: 'שלישי' },
  { value: 'wednesday', label: 'רביעי' },
  { value: 'thursday', label: 'חמישי' },
  { value: 'friday', label: 'שישי' },
  { value: 'saturday', label: 'שבת' }
];

const REQUIREMENT_CATEGORIES = [
  { value: 'equipment', label: 'ציוד' },
  { value: 'clothing', label: 'לבוש' },
  { value: 'documents', label: 'מסמכים' },
  { value: 'other', label: 'אחר' }
];

export default function EditActivityPage() {
  const params = useParams();
  const router = useRouter();
  const activityId = params.id as string;

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activity, setActivity] = useState({
    name: '',
    address: '',
    instructor_name: '',
    instructor_phone: '',
    child_id: '',
    group_id: ''
  });
  const [schedule, setSchedule] = useState<Schedule[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [childName, setChildName] = useState('');
  const [groupName, setGroupName] = useState('');

  useEffect(() => {
    loadActivity();
  }, [activityId]);

  const loadActivity = async () => {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('activities')
      .select(`
        *,
        children(name),
        groups(name),
        activity_requirements(id, category, description)
      `)
      .eq('id', activityId)
      .single();

    if (error || !data) {
      router.push('/activities');
      return;
    }

    const activityData = data as any;
    setActivity({
      name: activityData.name || '',
      address: activityData.address || '',
      instructor_name: activityData.instructor_name || '',
      instructor_phone: activityData.instructor_phone || '',
      child_id: activityData.child_id || '',
      group_id: activityData.group_id || ''
    });
    setSchedule(activityData.schedule || []);
    setRequirements(activityData.activity_requirements || []);
    setChildName(activityData.children?.name || '');
    setGroupName(activityData.groups?.name || '');
    setIsLoading(false);
  };

  const handleSave = async () => {
    setIsSaving(true);
    const supabase = createClient();

    // Update activity
    const { error: activityError } = await (supabase
      .from('activities') as any)
      .update({
        name: activity.name,
        address: activity.address || null,
        instructor_name: activity.instructor_name || null,
        instructor_phone: activity.instructor_phone || null,
        schedule: schedule
      })
      .eq('id', activityId);

    if (activityError) {
      alert('שגיאה בשמירה');
      setIsSaving(false);
      return;
    }

    // Handle requirements - delete removed ones, add new ones
    const existingIds = requirements.filter(r => r.id).map(r => r.id);
    
    // Delete requirements that were removed
    await supabase
      .from('activity_requirements')
      .delete()
      .eq('activity_id', activityId)
      .not('id', 'in', `(${existingIds.join(',')})`);

    // Add new requirements
    const newRequirements = requirements.filter(r => !r.id);
    if (newRequirements.length > 0) {
      await supabase
        .from('activity_requirements')
        .insert(newRequirements.map(r => ({
          activity_id: activityId,
          category: r.category,
          description: r.description
        })) as any);
    }

    setIsSaving(false);
    router.push('/activities');
  };

  const handleDelete = async () => {
    if (!confirm('האם למחוק את החוג?')) return;

    const supabase = createClient();
    await supabase.from('activities').delete().eq('id', activityId);
    router.push('/activities');
  };

  const addScheduleSlot = () => {
    setSchedule([...schedule, { day: 'sunday', start_time: '16:00', end_time: '17:00' }]);
  };

  const removeScheduleSlot = (index: number) => {
    setSchedule(schedule.filter((_, i) => i !== index));
  };

  const updateScheduleSlot = (index: number, field: keyof Schedule, value: string) => {
    const updated = [...schedule];
    updated[index] = { ...updated[index], [field]: value };
    setSchedule(updated);
  };

  const addRequirement = () => {
    setRequirements([...requirements, { category: 'equipment', description: '' }]);
  };

  const removeRequirement = (index: number) => {
    setRequirements(requirements.filter((_, i) => i !== index));
  };

  const updateRequirement = (index: number, field: keyof Requirement, value: string) => {
    const updated = [...requirements];
    updated[index] = { ...updated[index], [field]: value };
    setRequirements(updated);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/activities"
          className="p-2 hover:bg-muted rounded-lg transition-colors"
        >
          <ArrowRight className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground">עריכת חוג</h1>
          <p className="text-muted-foreground">{childName}</p>
        </div>
        <button
          onClick={handleDelete}
          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          title="מחק חוג"
        >
          <Trash2 className="w-5 h-5" />
        </button>
      </div>

      {/* Basic info */}
      <div className="bg-white rounded-xl border p-6 space-y-4">
        <h2 className="font-semibold text-foreground">פרטי החוג</h2>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            שם החוג
          </label>
          <input
            type="text"
            value={activity.name}
            onChange={(e) => setActivity({ ...activity, name: e.target.value })}
            className="w-full h-11 px-4 rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="למשל: כדורסל"
          />
        </div>

        {groupName && (
          <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
            קבוצה מקושרת: <span className="font-medium">{groupName}</span>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            <MapPin className="w-4 h-4 inline ml-1" />
            כתובת
          </label>
          <input
            type="text"
            value={activity.address}
            onChange={(e) => setActivity({ ...activity, address: e.target.value })}
            className="w-full h-11 px-4 rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="כתובת המקום"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              <User className="w-4 h-4 inline ml-1" />
              שם המדריך
            </label>
            <input
              type="text"
              value={activity.instructor_name}
              onChange={(e) => setActivity({ ...activity, instructor_name: e.target.value })}
              className="w-full h-11 px-4 rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="שם המדריך/ה"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              <Phone className="w-4 h-4 inline ml-1" />
              טלפון המדריך
            </label>
            <input
              type="tel"
              value={activity.instructor_phone}
              onChange={(e) => setActivity({ ...activity, instructor_phone: e.target.value })}
              className="w-full h-11 px-4 rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="050-1234567"
              dir="ltr"
            />
          </div>
        </div>
      </div>

      {/* Schedule */}
      <div className="bg-white rounded-xl border p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-foreground">
            <Clock className="w-4 h-4 inline ml-2" />
            לוח זמנים
          </h2>
          <button
            onClick={addScheduleSlot}
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            <Plus className="w-4 h-4" />
            הוסף יום
          </button>
        </div>

        {schedule.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            לא הוגדרו ימים. לחץ על "הוסף יום" להגדרת לוח זמנים.
          </p>
        ) : (
          <div className="space-y-3">
            {schedule.map((slot, index) => (
              <div key={index} className="flex items-center gap-3 bg-muted/30 p-3 rounded-lg">
                <select
                  value={slot.day}
                  onChange={(e) => updateScheduleSlot(index, 'day', e.target.value)}
                  className="px-3 py-2 rounded-lg border bg-white"
                >
                  {DAYS.map(day => (
                    <option key={day.value} value={day.value}>{day.label}</option>
                  ))}
                </select>
                <input
                  type="time"
                  value={slot.start_time}
                  onChange={(e) => updateScheduleSlot(index, 'start_time', e.target.value)}
                  className="px-3 py-2 rounded-lg border bg-white"
                />
                <span className="text-muted-foreground">עד</span>
                <input
                  type="time"
                  value={slot.end_time}
                  onChange={(e) => updateScheduleSlot(index, 'end_time', e.target.value)}
                  className="px-3 py-2 rounded-lg border bg-white"
                />
                <button
                  onClick={() => removeScheduleSlot(index)}
                  className="p-1 text-red-500 hover:bg-red-50 rounded"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Requirements */}
      <div className="bg-white rounded-xl border p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-foreground">דרישות קבועות</h2>
          <button
            onClick={addRequirement}
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            <Plus className="w-4 h-4" />
            הוסף דרישה
          </button>
        </div>

        <p className="text-sm text-muted-foreground">
          דרישות קבועות יופיעו תמיד בסיכום לפני החוג (למשל: בגדי ספורט, נעלי ספורט)
        </p>

        {requirements.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            אין דרישות קבועות. לחץ על "הוסף דרישה" להוספת פריט.
          </p>
        ) : (
          <div className="space-y-3">
            {requirements.map((req, index) => (
              <div key={index} className="flex items-center gap-3 bg-muted/30 p-3 rounded-lg">
                <select
                  value={req.category}
                  onChange={(e) => updateRequirement(index, 'category', e.target.value)}
                  className="px-3 py-2 rounded-lg border bg-white"
                >
                  {REQUIREMENT_CATEGORIES.map(cat => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={req.description}
                  onChange={(e) => updateRequirement(index, 'description', e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg border bg-white"
                  placeholder="תיאור הדרישה"
                />
                <button
                  onClick={() => removeRequirement(index)}
                  className="p-1 text-red-500 hover:bg-red-50 rounded"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Save button */}
      <div className="flex justify-end gap-3">
        <Link
          href="/activities"
          className="px-6 py-2.5 border rounded-lg hover:bg-muted transition-colors"
        >
          ביטול
        </Link>
        <button
          onClick={handleSave}
          disabled={isSaving || !activity.name}
          className="inline-flex items-center gap-2 bg-primary text-white px-6 py-2.5 rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {isSaving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          שמור
        </button>
      </div>
    </div>
  );
}




