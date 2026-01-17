'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Mail, Lock, User, Phone, ArrowLeft, Check, MessageSquare } from 'lucide-react';

// Format phone number to international format (972...)
function formatPhoneNumber(phone: string): string {
  // Remove all non-digit characters
  let digits = phone.replace(/\D/g, '');
  
  // Handle Israeli numbers
  if (digits.startsWith('0')) {
    // Remove leading 0 and add 972
    digits = '972' + digits.slice(1);
  } else if (!digits.startsWith('972') && digits.length === 9) {
    // If 9 digits without prefix, assume Israeli and add 972
    digits = '972' + digits;
  }
  
  return digits;
}

export default function RegisterPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    waOptIn: true
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (formData.password !== formData.confirmPassword) {
      setError('הסיסמאות אינן תואמות');
      return;
    }

    if (formData.password.length < 6) {
      setError('הסיסמה חייבת להכיל לפחות 6 תווים');
      return;
    }

    setIsLoading(true);

    try {
      const supabase = createClient();
      
      // Format phone number before saving
      const formattedPhone = formData.phone ? formatPhoneNumber(formData.phone) : null;
      
      const { error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            full_name: formData.fullName,
            phone: formattedPhone,
            wa_opt_in: formData.waOptIn
          }
        }
      });

      if (authError) {
        if (authError.message.includes('already registered')) {
          setError('כתובת האימייל כבר רשומה במערכת');
        } else {
          setError('שגיאה בהרשמה. נסו שוב.');
        }
        return;
      }

      router.push('/dashboard');
      router.refresh();
    } catch {
      setError('שגיאה בהרשמה. נסו שוב.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg border p-8">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-foreground mb-2">יצירת חשבון חדש</h1>
        <p className="text-muted-foreground">הצטרפו לאלפי הורים שכבר לא מפספסים</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="fullName" className="block text-sm font-medium text-foreground mb-1.5">
            שם מלא
          </label>
          <div className="relative">
            <User className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              id="fullName"
              name="fullName"
              type="text"
              value={formData.fullName}
              onChange={handleChange}
              placeholder="השם שלכם"
              required
              className="w-full h-11 pr-10 pl-4 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-foreground mb-1.5">
            אימייל
          </label>
          <div className="relative">
            <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              id="email"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="your@email.com"
              required
              dir="ltr"
              className="w-full h-11 pr-10 pl-4 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-foreground mb-1.5">
            טלפון (לקבלת התראות WhatsApp)
          </label>
          <div className="relative">
            <Phone className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              id="phone"
              name="phone"
              type="tel"
              value={formData.phone}
              onChange={handleChange}
              placeholder="054-XXX-XXXX"
              dir="ltr"
              className="w-full h-11 pr-10 pl-4 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            הזינו מספר טלפון ישראלי
          </p>
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-foreground mb-1.5">
            סיסמה
          </label>
          <div className="relative">
            <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              id="password"
              name="password"
              type="password"
              value={formData.password}
              onChange={handleChange}
              placeholder="לפחות 6 תווים"
              required
              className="w-full h-11 pr-10 pl-4 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-foreground mb-1.5">
            אימות סיסמה
          </label>
          <div className="relative">
            <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              value={formData.confirmPassword}
              onChange={handleChange}
              placeholder="הקלידו שוב את הסיסמה"
              required
              className="w-full h-11 pr-10 pl-4 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        {/* WhatsApp Consent */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              name="waOptIn"
              checked={formData.waOptIn}
              onChange={handleChange}
              className="mt-1 h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-green-600" />
                <span className="font-medium text-green-800">אישור קבלת הודעות WhatsApp</span>
              </div>
              <p className="text-sm text-green-700 mt-1">
                אני מסכים/ה לקבל סיכומים יומיים והתראות דחופות למספר הטלפון שלי דרך WhatsApp
              </p>
            </div>
          </label>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full h-11 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            <>
              יצירת חשבון
              <ArrowLeft className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      <div className="mt-6 text-center">
        <p className="text-muted-foreground">
          כבר יש לכם חשבון?{' '}
          <Link href="/login" className="text-primary hover:underline font-medium">
            התחברו
          </Link>
        </p>
      </div>
    </div>
  );
}
