// Shared types and utilities for Parent Assistant

// Message categories
export const MESSAGE_CATEGORIES = [
  'equipment',
  'food',
  'event',
  'schedule_change',
  'parent_request',
  'teacher_message',
  'study_material',
  'activity',
  'noise'
] as const;

export type MessageCategory = typeof MESSAGE_CATEGORIES[number];

// WhatsApp session statuses
export const SESSION_STATUSES = [
  'connected',
  'disconnected',
  'connecting',
  'qr_required',
  'unstable',
  'manual_reauth_required'
] as const;

export type SessionStatus = typeof SESSION_STATUSES[number];

// Message classification result
export interface MessageClassification {
  category: MessageCategory;
  urgency: number; // 0-10
  action_required: boolean;
  summary: string;
  child_relevant: boolean;
  send_immediate_alert: boolean;
}

// User notification settings
export interface NotificationSettings {
  daily_summary_enabled: boolean;
  daily_summary_time: string; // HH:mm format
  immediate_alerts_enabled: boolean;
  quiet_hours_start: string; // HH:mm format (default: 22:00)
  quiet_hours_end: string; // HH:mm format (default: 07:00)
}

// Default notification settings
export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  daily_summary_enabled: true,
  daily_summary_time: '20:30',
  immediate_alerts_enabled: true,
  quiet_hours_start: '22:00',
  quiet_hours_end: '07:00'
};

// Activity schedule
export interface ActivitySchedule {
  day: 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday';
  start_time: string; // HH:mm
  end_time: string; // HH:mm
}

// Requirement categories for activities
export const REQUIREMENT_CATEGORIES = [
  'equipment',
  'clothing',
  'documents',
  'other'
] as const;

export type RequirementCategory = typeof REQUIREMENT_CATEGORIES[number];

// Utility functions
export function isWithinQuietHours(
  currentTime: Date,
  quietStart: string,
  quietEnd: string
): boolean {
  const current = currentTime.getHours() * 60 + currentTime.getMinutes();
  const [startH, startM] = quietStart.split(':').map(Number);
  const [endH, endM] = quietEnd.split(':').map(Number);
  const start = startH * 60 + startM;
  const end = endH * 60 + endM;

  // Handle overnight quiet hours (e.g., 22:00 - 07:00)
  if (start > end) {
    return current >= start || current < end;
  }
  return current >= start && current < end;
}

export function formatHebrewDate(date: Date): string {
  return date.toLocaleDateString('he-IL', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

export function formatHebrewTime(date: Date): string {
  return date.toLocaleTimeString('he-IL', {
    hour: '2-digit',
    minute: '2-digit'
  });
}




