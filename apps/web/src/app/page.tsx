import Link from 'next/link';
import { ArrowLeft, MessageSquare, Calendar, Bell, Shield } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
              <MessageSquare className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold text-foreground">עוזר להורים</span>
          </div>
          <nav className="flex items-center gap-4">
            <Link
              href="/login"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              התחברות
            </Link>
            <Link
              href="/register"
              className="bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors"
            >
              הרשמה חינם
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <main className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-6xl font-bold text-foreground mb-6">
            לא מפספסים יותר הודעות{' '}
            <span className="text-primary">מהגן או מבית הספר</span>
          </h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            העוזר האישי שלכם קורא את כל ההודעות מקבוצות ה-WhatsApp,
            מבין מה חשוב, ושולח לכם סיכום יומי עם כל מה שצריך לדעת.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/register"
              className="inline-flex items-center justify-center gap-2 bg-primary text-white px-8 py-4 rounded-xl text-lg font-medium hover:bg-primary/90 transition-colors"
            >
              התחילו עכשיו - חינם
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <Link
              href="#features"
              className="inline-flex items-center justify-center gap-2 border border-input px-8 py-4 rounded-xl text-lg font-medium hover:bg-accent transition-colors"
            >
              איך זה עובד?
            </Link>
          </div>
        </div>

        {/* Features */}
        <section id="features" className="mt-24 grid md:grid-cols-3 gap-8">
          <FeatureCard
            icon={<MessageSquare className="w-8 h-8" />}
            title="חיבור אוטומטי לוואטסאפ"
            description="מתחברים פעם אחת וזהו. המערכת קוראת את כל ההודעות מהקבוצות הרלוונטיות אוטומטית."
          />
          <FeatureCard
            icon={<Calendar className="w-8 h-8" />}
            title="סיכום יומי חכם"
            description="כל יום בשעה שנוחה לכם מקבלים סיכום עם כל מה שצריך לדעת למחר - ציוד, אירועים, שינויים."
          />
          <FeatureCard
            icon={<Bell className="w-8 h-8" />}
            title="התראות דחופות"
            description="שינוי ברגע האחרון? המערכת מזהה ושולחת התראה מיידית כדי שלא תפספסו."
          />
        </section>

        {/* Trust Section */}
        <section className="mt-24 text-center">
          <div className="inline-flex items-center gap-2 bg-green-100 text-green-800 px-4 py-2 rounded-full mb-4">
            <Shield className="w-5 h-5" />
            <span className="font-medium">פרטיות מלאה</span>
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-4">
            המידע שלכם נשאר שלכם
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            אנחנו לא שומרים תוכן הודעות מיותר, לא משתמשים במידע לשום מטרה אחרת,
            ואתם יכולים למחוק את כל המידע בכל רגע.
          </p>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t mt-24 py-8">
        <div className="container mx-auto px-4 text-center text-muted-foreground">
          <p>&copy; 2026 עוזר להורים. כל הזכויות שמורות.</p>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border hover:shadow-md transition-shadow">
      <div className="w-14 h-14 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4">
        {icon}
      </div>
      <h3 className="text-xl font-semibold text-foreground mb-2">{title}</h3>
      <p className="text-muted-foreground">{description}</p>
    </div>
  );
}




