'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ChevronRight, ChevronLeft, Calendar, ExternalLink, Loader2 } from 'lucide-react';
import Link from 'next/link';

interface GoogleEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: string;
  end: string;
  allDay: boolean;
  htmlLink: string;
}

interface Activity {
  name: string;
  childName: string;
  time: string;
}

export default function CalendarPage() {
  const [children, setChildren] = useState<any[]>([]);
  const [upcomingItems, setUpcomingItems] = useState<any[]>([]);
  const [googleEvents, setGoogleEvents] = useState<GoogleEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);

  const today = new Date();
  const dayNames = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  const dayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  // Calculate week days based on offset
  const getWeekDays = () => {
    const days = [];
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay() + (weekOffset * 7));
    
    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      days.push(date);
    }
    return days;
  };

  const weekDays = getWeekDays();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      setIsLoading(false);
      return;
    }

    // Load children with activities
    const { data: childrenData } = await supabase
      .from('children')
      .select(`
        id,
        name,
        activities:activities(id, name, schedule)
      `)
      .eq('user_id', user.id);

    if (childrenData) {
      setChildren(childrenData);
    }

    // Load upcoming extracted items
    const { data: items } = await supabase
      .from('extracted_items')
      .select('id, summary, category, created_at, child_id, data')
      .in('category', ['event', 'schedule_change'])
      .gte('created_at', today.toISOString())
      .order('created_at', { ascending: true })
      .limit(10);

    if (items) {
      setUpcomingItems(items);
    }

    // Load Google Calendar events
    try {
      const response = await fetch('/api/calendar/events');
      const data = await response.json();
      setGoogleEvents(data.events || []);
      setIsConnected(data.connected || false);
    } catch (error) {
      console.error('Failed to fetch Google Calendar events:', error);
    }

    setIsLoading(false);
  };

  // Build schedule map from activities
  const scheduleByDay: Record<string, Activity[]> = {};
  dayKeys.forEach(day => { scheduleByDay[day] = []; });

  children?.forEach(child => {
    child.activities?.forEach((activity: any) => {
      const schedule = activity.schedule as { day: string; start_time: string; end_time: string }[] || [];
      schedule.forEach(slot => {
        if (scheduleByDay[slot.day]) {
          scheduleByDay[slot.day].push({
            name: activity.name,
            childName: child.name,
            time: `${slot.start_time} - ${slot.end_time}`
          });
        }
      });
    });
  });

  // Get Google events for a specific day
  const getGoogleEventsForDay = (date: Date) => {
    return googleEvents.filter(event => {
      const eventDate = new Date(event.start);
      return eventDate.toDateString() === date.toDateString();
    });
  };

  // Format time from ISO string
  const formatTime = (isoString: string, allDay: boolean) => {
    if (allDay) return 'כל היום';
    const date = new Date(isoString);
    return date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  };

  // Get current month display
  const getMonthDisplay = () => {
    const middleOfWeek = new Date(weekDays[3]);
    return middleOfWeek.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">לוח שנה</h1>
          <p className="text-muted-foreground">סקירת השבוע</p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setWeekOffset(w => w - 1)}
            className="p-2 rounded-lg border hover:bg-muted transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          <button
            onClick={() => setWeekOffset(0)}
            className="text-sm font-medium px-4 py-2 hover:bg-muted rounded-lg transition-colors"
          >
            {getMonthDisplay()}
          </button>
          <button 
            onClick={() => setWeekOffset(w => w + 1)}
            className="p-2 rounded-lg border hover:bg-muted transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Google Calendar connection status */}
      {!isConnected && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-orange-600" />
              <div>
                <p className="font-medium text-orange-800">Google Calendar לא מחובר</p>
                <p className="text-sm text-orange-700">חבר את היומן שלך כדי לראות אירועים</p>
              </div>
            </div>
            <Link 
              href="/settings#calendar"
              className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 text-sm"
            >
              חיבור
            </Link>
          </div>
        </div>
      )}

      {/* Week view */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="grid grid-cols-7 border-b">
          {weekDays.map((date, i) => {
            const isToday = date.toDateString() === today.toDateString();
            return (
              <div 
                key={i} 
                className={`p-3 text-center border-l first:border-l-0 ${isToday ? 'bg-primary/5' : ''}`}
              >
                <p className="text-sm text-muted-foreground">{dayNames[i]}</p>
                <p className={`text-lg font-semibold ${isToday ? 'text-primary' : 'text-foreground'}`}>
                  {date.getDate()}
                </p>
              </div>
            );
          })}
        </div>
        <div className="grid grid-cols-7 min-h-[350px]">
          {weekDays.map((date, i) => {
            const dayKey = dayKeys[i];
            const activities = scheduleByDay[dayKey] || [];
            const dayGoogleEvents = getGoogleEventsForDay(date);
            const isToday = date.toDateString() === today.toDateString();
            
            return (
              <div 
                key={i} 
                className={`p-2 border-l first:border-l-0 ${isToday ? 'bg-primary/5' : ''}`}
              >
                <div className="space-y-2">
                  {/* Google Calendar events */}
                  {dayGoogleEvents.map((event) => (
                    <a 
                      key={event.id}
                      href={event.htmlLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block p-2 rounded-lg bg-green-100 text-green-800 text-xs hover:bg-green-200 transition-colors"
                    >
                      <p className="font-medium truncate">{event.summary}</p>
                      <p className="text-green-600">{formatTime(event.start, event.allDay)}</p>
                      {event.location && (
                        <p className="text-green-600 truncate">{event.location}</p>
                      )}
                    </a>
                  ))}
                  
                  {/* Activities */}
                  {activities.map((activity, j) => (
                    <div 
                      key={j}
                      className="p-2 rounded-lg bg-blue-100 text-blue-800 text-xs"
                    >
                      <p className="font-medium">{activity.name}</p>
                      <p className="text-blue-600">{activity.time}</p>
                      <p className="text-blue-600">{activity.childName}</p>
                    </div>
                  ))}
                  
                  {activities.length === 0 && dayGoogleEvents.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center mt-4">-</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Google Calendar Events List */}
      {isConnected && googleEvents.length > 0 && (
        <div className="bg-white rounded-xl border p-6">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="w-5 h-5 text-green-600" />
            <h2 className="text-lg font-semibold">אירועים מ-Google Calendar</h2>
          </div>
          <div className="space-y-3">
            {googleEvents.slice(0, 10).map((event) => (
              <a 
                key={event.id}
                href={event.htmlLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-3 p-3 rounded-lg bg-green-50 hover:bg-green-100 transition-colors"
              >
                <div className="w-2 h-2 mt-2 rounded-full bg-green-500" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground font-medium">{event.summary}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(event.start).toLocaleDateString('he-IL', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long'
                    })}
                    {!event.allDay && ` בשעה ${formatTime(event.start, false)}`}
                  </p>
                  {event.location && (
                    <p className="text-xs text-muted-foreground">{event.location}</p>
                  )}
                </div>
                <ExternalLink className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Upcoming extracted events */}
      <div className="bg-white rounded-xl border p-6">
        <h2 className="text-lg font-semibold mb-4">אירועים שזוהו מהקבוצות</h2>
        {upcomingItems && upcomingItems.length > 0 ? (
          <div className="space-y-3">
            {upcomingItems.map((item) => (
              <div key={item.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <div className={`w-2 h-2 mt-2 rounded-full ${
                  item.category === 'schedule_change' ? 'bg-yellow-500' : 'bg-blue-500'
                }`} />
                <div>
                  <p className="text-sm text-foreground">{item.summary}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(item.created_at).toLocaleDateString('he-IL')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-center py-8">
            אין אירועים שזוהו לאחרונה
          </p>
        )}
      </div>
    </div>
  );
}
