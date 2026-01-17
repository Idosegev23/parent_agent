import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// Re-export types
export type { Database, Tables, TablesInsert, TablesUpdate, Json } from './types';

// Create Supabase client for server-side usage
export function createServerClient(
  supabaseUrl: string,
  supabaseServiceKey: string
) {
  return createClient<Database>(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

// Create Supabase client for client-side usage
export function createBrowserClient(
  supabaseUrl: string,
  supabaseAnonKey: string
) {
  return createClient<Database>(supabaseUrl, supabaseAnonKey);
}

// Table names for reference
export const TABLES = {
  USERS: 'users',
  CHILDREN: 'children',
  GROUPS: 'groups',
  ACTIVITIES: 'activities',
  ACTIVITY_REQUIREMENTS: 'activity_requirements',
  WA_SESSIONS: 'wa_sessions',
  WA_RAW_MESSAGES: 'wa_raw_messages',
  EXTRACTED_ITEMS: 'extracted_items',
  DIGESTS: 'digests',
  ALERTS: 'alerts',
  AUDIT_LOGS: 'audit_logs'
} as const;


