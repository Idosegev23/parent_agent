'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ArrowRight, User, Calendar } from 'lucide-react';
import Link from 'next/link';

export default function NewChildPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: '',
    birthDate: ''
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setError('יש להתחבר מחדש');
        return;
      }

      const { error: insertError } = await supabase
        .from('children')
        .insert({
          user_id: user.id,
          name: formData.name,
          birth_date: formData.birthDate || null
        });

      if (insertError) {
        setError('שגיאה ביצירת הילד. נסו שוב.');
        return;
      }

      router.push('/children');
      router.refresh();
    } catch {
      setError('שגיאה ביצירת הילד. נסו שוב.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto">
      {/* Back link */}
      <Link
        href="/children"
        className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowRight className="w-4 h-4" />
        חזרה לרשימה
      </Link>

      <div className="bg-white rounded-xl border p-6">
        <h1 className="text-xl font-bold text-foreground mb-6">הוספת ילד חדש</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="name" className="block text-sm font-medium text-foreground mb-1.5">
              שם הילד
            </label>
            <div className="relative">
              <User className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <input
                id="name"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="שם הילד"
                required
                className="w-full h-11 pr-10 pl-4 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <div>
            <label htmlFor="birthDate" className="block text-sm font-medium text-foreground mb-1.5">
              תאריך לידה (אופציונלי)
            </label>
            <div className="relative">
              <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <input
                id="birthDate"
                type="date"
                value={formData.birthDate}
                onChange={(e) => setFormData(prev => ({ ...prev, birthDate: e.target.value }))}
                className="w-full h-11 pr-10 pl-4 rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
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
                'הוסף ילד'
              )}
            </button>
            <Link
              href="/children"
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




