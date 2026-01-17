'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ArrowRight, Activity, Clock, MapPin, Phone, User } from 'lucide-react';
import Link from 'next/link';

export default function NewActivityPage() {
  const router = useRouter();
  const [children, setChildren] = useState<{ id: string; name: string }[]>([]);
  const [formData, setFormData] = useState({
    childId: '',
    name: '',
    day: 'sunday',
    startTime: '',
    endTime: '',
    address: '',
    instructorName: '',
    instructorPhone: ''
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadChildren();
  }, []);

  const loadChildren = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('children')
      .select('id, name')
      .eq('user_id', user.id);

    setChildren(data || []);
    if (data && data.length > 0) {
      setFormData(prev => ({ ...prev, childId: data[0].id }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const supabase = createClient();

      const { error: insertError } = await supabase
        .from('activities')
        .insert({
          child_id: formData.childId,
          name: formData.name,
          schedule: [{
            day: formData.day,
            start_time: formData.startTime,
            end_time: formData.endTime
          }],
          address: formData.address || null,
          instructor_name: formData.instructorName || null,
          instructor_phone: formData.instructorPhone || null
        });

      if (insertError) {
        setError('שגיאה ביצירת החוג. נסו שוב.');
        return;
      }

      router.push('/activities');
      router.refresh();
    } catch {
      setError('שגיאה ביצירת החוג. נסו שוב.');
    } finally {
      setIsLoading(false);
    }
  };

  const dayOptions = [
    { value: 'sunday', label: 'ראשון' },
    { value: 'monday', label: 'שני' },
    { value: 'tuesday', label: 'שלישי' },
    { value: 'wednesday', label: 'רביעי' },
    { value: 'thursday', label: 'חמישי' },
    { value: 'friday', label: 'שישי' },
    { value: 'saturday', label: 'שבת' }
  ];

  if (children.length === 0) {
    return (
      <div className="max-w-xl mx-auto text-center py-12">
        <p className="text-muted-foreground mb-4">
          יש להוסיף ילד לפני הוספת חוג
        </p>
        <Link
          href="/children/new"
          className="inline-flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-lg"
        >
          הוסף ילד
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto">
      <Link
        href="/activities"
        className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowRight className="w-4 h-4" />
        חזרה לרשימה
      </Link>

      <div className="bg-white rounded-xl border p-6">
        <h1 className="text-xl font-bold text-foreground mb-6">הוספת חוג חדש</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg">
              {error}
            </div>
          )}

          {/* Child selection */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              ילד
            </label>
            <select
              value={formData.childId}
              onChange={(e) => setFormData(prev => ({ ...prev, childId: e.target.value }))}
              className="w-full h-11 px-4 rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {children.map((child) => (
                <option key={child.id} value={child.id}>{child.name}</option>
              ))}
            </select>
          </div>

          {/* Activity name */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              שם החוג
            </label>
            <div className="relative">
              <Activity className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="למשל: כדורגל, פסנתר, ציור"
                required
                className="w-full h-11 pr-10 pl-4 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          {/* Schedule */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                יום
              </label>
              <select
                value={formData.day}
                onChange={(e) => setFormData(prev => ({ ...prev, day: e.target.value }))}
                className="w-full h-11 px-3 rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {dayOptions.map((day) => (
                  <option key={day.value} value={day.value}>{day.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                שעת התחלה
              </label>
              <input
                type="time"
                value={formData.startTime}
                onChange={(e) => setFormData(prev => ({ ...prev, startTime: e.target.value }))}
                required
                className="w-full h-11 px-3 rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                שעת סיום
              </label>
              <input
                type="time"
                value={formData.endTime}
                onChange={(e) => setFormData(prev => ({ ...prev, endTime: e.target.value }))}
                required
                className="w-full h-11 px-3 rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          {/* Address */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              כתובת (אופציונלי)
            </label>
            <div className="relative">
              <MapPin className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <input
                type="text"
                value={formData.address}
                onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                placeholder="כתובת המקום"
                className="w-full h-11 pr-10 pl-4 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          {/* Instructor */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                שם המדריך
              </label>
              <div className="relative">
                <User className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  type="text"
                  value={formData.instructorName}
                  onChange={(e) => setFormData(prev => ({ ...prev, instructorName: e.target.value }))}
                  placeholder="שם"
                  className="w-full h-11 pr-10 pl-4 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                טלפון המדריך
              </label>
              <div className="relative">
                <Phone className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  type="tel"
                  value={formData.instructorPhone}
                  onChange={(e) => setFormData(prev => ({ ...prev, instructorPhone: e.target.value }))}
                  placeholder="05X-XXXXXXX"
                  dir="ltr"
                  className="w-full h-11 pr-10 pl-4 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 h-11 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {isLoading ? (
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                'הוסף חוג'
              )}
            </button>
            <Link
              href="/activities"
              className="px-6 h-11 border border-input rounded-lg font-medium hover:bg-muted transition-colors flex items-center justify-center"
            >
              ביטול
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}




