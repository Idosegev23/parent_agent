export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      activities: {
        Row: {
          address: string | null
          child_id: string
          created_at: string | null
          group_id: string | null
          id: string
          instructor_name: string | null
          instructor_phone: string | null
          name: string
          schedule: Json | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          child_id: string
          created_at?: string | null
          group_id?: string | null
          id?: string
          instructor_name?: string | null
          instructor_phone?: string | null
          name: string
          schedule?: Json | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          child_id?: string
          created_at?: string | null
          group_id?: string | null
          id?: string
          instructor_name?: string | null
          instructor_phone?: string | null
          name?: string
          schedule?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activities_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_requirements: {
        Row: {
          activity_id: string
          category: string
          created_at: string | null
          description: string
          id: string
        }
        Insert: {
          activity_id: string
          category: string
          created_at?: string | null
          description: string
          id?: string
        }
        Update: {
          activity_id?: string
          category?: string
          created_at?: string | null
          description?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_requirements_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
        ]
      }
      alerts: {
        Row: {
          content: string
          created_at: string | null
          id: string
          item_id: string | null
          sent: boolean | null
          sent_at: string | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          item_id?: string | null
          sent?: boolean | null
          sent_at?: string | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          item_id?: string | null
          sent?: boolean | null
          sent_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "extracted_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string | null
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_connections: {
        Row: {
          access_token: string
          calendar_id: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          provider: string
          refresh_token: string | null
          token_expires_at: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          access_token: string
          calendar_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          provider?: string
          refresh_token?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          access_token?: string
          calendar_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          provider?: string
          refresh_token?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_connections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          created_at: string | null
          end_time: string
          google_event_id: string
          id: string
          location: string | null
          reminder_sent: boolean | null
          reminder_sent_at: string | null
          start_time: string
          summary: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          end_time: string
          google_event_id: string
          id?: string
          location?: string | null
          reminder_sent?: boolean | null
          reminder_sent_at?: string | null
          start_time: string
          summary: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          end_time?: string
          google_event_id?: string
          id?: string
          location?: string | null
          reminder_sent?: boolean | null
          reminder_sent_at?: string | null
          start_time?: string
          summary?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      children: {
        Row: {
          birth_date: string | null
          created_at: string | null
          id: string
          name: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          birth_date?: string | null
          created_at?: string | null
          id?: string
          name: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          birth_date?: string | null
          created_at?: string | null
          id?: string
          name?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "children_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      digests: {
        Row: {
          content: string
          created_at: string | null
          digest_date: string
          id: string
          items_count: number | null
          sent_at: string | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          digest_date: string
          id?: string
          items_count?: number | null
          sent_at?: string | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          digest_date?: string
          id?: string
          items_count?: number | null
          sent_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "digests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      extracted_items: {
        Row: {
          action_required: boolean | null
          category: string
          child_id: string | null
          created_at: string | null
          data: Json | null
          id: string
          message_date: string | null
          message_id: string
          summary: string
          urgency: number | null
        }
        Insert: {
          action_required?: boolean | null
          category: string
          child_id?: string | null
          created_at?: string | null
          data?: Json | null
          id?: string
          message_date?: string | null
          message_id: string
          summary: string
          urgency?: number | null
        }
        Update: {
          action_required?: boolean | null
          category?: string
          child_id?: string | null
          created_at?: string | null
          data?: Json | null
          id?: string
          message_date?: string | null
          message_id?: string
          summary?: string
          urgency?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "extracted_items_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extracted_items_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "wa_raw_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          child_id: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          type: string | null
          updated_at: string | null
          user_id: string
          wa_group_id: string
        }
        Insert: {
          child_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          type?: string | null
          updated_at?: string | null
          user_id: string
          wa_group_id: string
        }
        Update: {
          child_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          type?: string | null
          updated_at?: string | null
          user_id?: string
          wa_group_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "groups_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "groups_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      message_queue: {
        Row: {
          content: string
          created_at: string | null
          error_message: string | null
          id: string
          message_type: string
          related_item_id: string | null
          retry_count: number
          scheduled_for: string
          sent_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          error_message?: string | null
          id?: string
          message_type: string
          related_item_id?: string | null
          retry_count?: number
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          error_message?: string | null
          id?: string
          message_type?: string
          related_item_id?: string | null
          retry_count?: number
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_queue_related_item_id_fkey"
            columns: ["related_item_id"]
            isOneToOne: false
            referencedRelation: "extracted_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_queue_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_approvals: {
        Row: {
          created_at: string | null
          event_description: string | null
          event_end: string
          event_location: string | null
          event_start: string
          event_summary: string
          expires_at: string | null
          id: string
          original_message_id: string | null
          phone: string
          status: string | null
          user_id: string | null
          whatsapp_message_id: string | null
        }
        Insert: {
          created_at?: string | null
          event_description?: string | null
          event_end: string
          event_location?: string | null
          event_start: string
          event_summary: string
          expires_at?: string | null
          id?: string
          original_message_id?: string | null
          phone: string
          status?: string | null
          user_id?: string | null
          whatsapp_message_id?: string | null
        }
        Update: {
          created_at?: string | null
          event_description?: string | null
          event_end?: string
          event_location?: string | null
          event_start?: string
          event_summary?: string
          expires_at?: string | null
          id?: string
          original_message_id?: string | null
          phone?: string
          status?: string | null
          user_id?: string | null
          whatsapp_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pending_approvals_original_message_id_fkey"
            columns: ["original_message_id"]
            isOneToOne: false
            referencedRelation: "wa_raw_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_approvals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      scan_requests: {
        Row: {
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          group_id: string
          id: string
          messages_found: number | null
          status: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          group_id: string
          id?: string
          messages_found?: number | null
          status?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          group_id?: string
          id?: string
          messages_found?: number | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scan_requests_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string | null
          daily_summary_time: string | null
          email: string
          full_name: string | null
          id: string
          is_admin: boolean | null
          notification_settings: Json | null
          phone: string | null
          updated_at: string | null
          wa_opt_in: boolean | null
        }
        Insert: {
          created_at?: string | null
          daily_summary_time?: string | null
          email: string
          full_name?: string | null
          id: string
          is_admin?: boolean | null
          notification_settings?: Json | null
          phone?: string | null
          updated_at?: string | null
          wa_opt_in?: boolean | null
        }
        Update: {
          created_at?: string | null
          daily_summary_time?: string | null
          email?: string
          full_name?: string | null
          id?: string
          is_admin?: boolean | null
          notification_settings?: Json | null
          phone?: string | null
          updated_at?: string | null
          wa_opt_in?: boolean | null
        }
        Relationships: []
      }
      wa_raw_messages: {
        Row: {
          content: string
          created_at: string | null
          group_id: string
          id: string
          media_type: string | null
          processed: boolean | null
          received_at: string | null
          sender: string
          sender_name: string | null
          wa_message_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          group_id: string
          id?: string
          media_type?: string | null
          processed?: boolean | null
          received_at?: string | null
          sender: string
          sender_name?: string | null
          wa_message_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          group_id?: string
          id?: string
          media_type?: string | null
          processed?: boolean | null
          received_at?: string | null
          sender?: string
          sender_name?: string | null
          wa_message_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_raw_messages_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_sessions: {
        Row: {
          created_at: string | null
          error_message: string | null
          id: string
          last_heartbeat: string | null
          qr_code: string | null
          status: string | null
          updated_at: string | null
          user_id: string
          worker_id: string | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          last_heartbeat?: string | null
          qr_code?: string | null
          status?: string | null
          updated_at?: string | null
          user_id: string
          worker_id?: string | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          last_heartbeat?: string | null
          qr_code?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wa_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cleanup_old_messages: { Args: never; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
