export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      hourly_rates: {
        Row: {
          created_at: string
          hourly_rate: number
          id: string
          professional_id: string
          updated_at: string
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          created_at?: string
          hourly_rate: number
          id?: string
          professional_id: string
          updated_at?: string
          valid_from: string
          valid_until?: string | null
        }
        Update: {
          created_at?: string
          hourly_rate?: number
          id?: string
          professional_id?: string
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hourly_rates_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name: string
          id: string
          role: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      project_financials: {
        Row: {
          contracted_revenue: number
          created_at: string
          indirect_cost: number
          project_id: string
          tax_rate: number
          updated_at: string
        }
        Insert: {
          contracted_revenue: number
          created_at?: string
          indirect_cost: number
          project_id: string
          tax_rate: number
          updated_at?: string
        }
        Update: {
          contracted_revenue?: number
          created_at?: string
          indirect_cost?: number
          project_id?: string
          tax_rate?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_financials_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          client: string
          created_at: string
          end_date: string
          id: string
          name: string
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          client: string
          created_at?: string
          end_date: string
          id?: string
          name: string
          start_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          client?: string
          created_at?: string
          end_date?: string
          id?: string
          name?: string
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      time_entries: {
        Row: {
          applied_hourly_rate: number
          approval_status: string
          created_at: string
          description: string
          duration_minutes: number
          entry_date: string
          id: string
          professional_id: string
          project_id: string
          rejection_reason: string | null
          rejected_at: string | null
          rejected_by: string | null
          updated_at: string
        }
        Insert: {
          applied_hourly_rate: number
          approval_status?: string
          created_at?: string
          description: string
          duration_minutes: number
          entry_date: string
          id?: string
          professional_id: string
          project_id: string
          rejection_reason?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          updated_at?: string
        }
        Update: {
          applied_hourly_rate?: number
          approval_status?: string
          created_at?: string
          description?: string
          duration_minutes?: number
          entry_date?: string
          id?: string
          professional_id?: string
          project_id?: string
          rejection_reason?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_rejected_by_fkey"
            columns: ["rejected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entry_approval_history: {
        Row: {
          id: string
          time_entry_id: string
          previous_status: string
          new_status: string
          reason: string | null
          changed_by: string
          created_at: string
        }
        Insert: {
          id?: string
          time_entry_id: string
          previous_status: string
          new_status: string
          reason?: string | null
          changed_by: string
          created_at?: string
        }
        Update: {
          id?: string
          time_entry_id?: string
          previous_status?: string
          new_status?: string
          reason?: string | null
          changed_by?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entry_approval_history_time_entry_id_fkey"
            columns: ["time_entry_id"]
            isOneToOne: false
            referencedRelation: "time_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entry_approval_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          id: string
          actor_id: string | null
          action: string
          entity_type: string
          entity_id: string | null
          before_data: Json | null
          after_data: Json | null
          metadata: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          actor_id?: string | null
          action: string
          entity_type: string
          entity_id?: string | null
          before_data?: Json | null
          after_data?: Json | null
          metadata?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          actor_id?: string | null
          action?: string
          entity_type?: string
          entity_id?: string | null
          before_data?: Json | null
          after_data?: Json | null
          metadata?: Json | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      accounting_periods: {
        Row: {
          id: string
          period_key: string
          status: string
          closed_at: string | null
          closed_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          period_key: string
          status?: string
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          period_key?: string
          status?: string
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounting_periods_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          id: string
          user_id: string
          type: string
          title: string
          body: string | null
          entity_type: string | null
          entity_id: string | null
          read_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          type: string
          title: string
          body?: string | null
          entity_type?: string | null
          entity_id?: string | null
          read_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          type?: string
          title?: string
          body?: string | null
          entity_type?: string | null
          entity_id?: string | null
          read_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entry_comments: {
        Row: {
          id: string
          time_entry_id: string
          author_id: string
          body: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          time_entry_id: string
          author_id: string
          body: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          time_entry_id?: string
          author_id?: string
          body?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entry_comments_time_entry_id_fkey"
            columns: ["time_entry_id"]
            isOneToOne: false
            referencedRelation: "time_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entry_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entry_attachments: {
        Row: {
          id: string
          time_entry_id: string
          uploaded_by: string
          file_name: string
          file_size: number
          content_type: string
          storage_path: string
          created_at: string
        }
        Insert: {
          id?: string
          time_entry_id: string
          uploaded_by: string
          file_name: string
          file_size: number
          content_type: string
          storage_path: string
          created_at?: string
        }
        Update: {
          id?: string
          time_entry_id?: string
          uploaded_by?: string
          file_name?: string
          file_size?: number
          content_type?: string
          storage_path?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entry_attachments_time_entry_id_fkey"
            columns: ["time_entry_id"]
            isOneToOne: false
            referencedRelation: "time_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entry_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_time_entry_rules: {
        Row: {
          id: string
          professional_id: string
          project_id: string
          description: string
          duration_minutes: number
          frequency: string
          day_of_week: number | null
          day_of_month: number | null
          start_date: string
          end_date: string | null
          is_active: boolean
          last_run_date: string | null
          next_run_date: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          professional_id: string
          project_id: string
          description: string
          duration_minutes: number
          frequency: string
          day_of_week?: number | null
          day_of_month?: number | null
          start_date: string
          end_date?: string | null
          is_active?: boolean
          last_run_date?: string | null
          next_run_date: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          professional_id?: string
          project_id?: string
          description?: string
          duration_minutes?: number
          frequency?: string
          day_of_week?: number | null
          day_of_month?: number | null
          start_date?: string
          end_date?: string | null
          is_active?: boolean
          last_run_date?: string | null
          next_run_date?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_time_entry_rules_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_time_entry_rules_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_budgets: {
        Row: {
          id: string
          project_id: string
          budget_type: string
          budget_value: number
          fiscal_year: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          project_id: string
          budget_type: string
          budget_value: number
          fiscal_year: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          budget_type?: string
          budget_value?: number
          fiscal_year?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_budgets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      profitability_alerts: {
        Row: {
          id: string
          project_id: string
          threshold: number
          metric: string
          triggered_at: string | null
          acknowledged_by: string | null
          acknowledged_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          project_id: string
          threshold: number
          metric: string
          triggered_at?: string | null
          acknowledged_by?: string | null
          acknowledged_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          threshold?: number
          metric?: string
          triggered_at?: string | null
          acknowledged_by?: string | null
          acknowledged_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profitability_alerts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profitability_alerts_acknowledged_by_fkey"
            columns: ["acknowledged_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          user_id: string
          pref_key: string
          pref_value: Json
          updated_at: string
        }
        Insert: {
          user_id: string
          pref_key: string
          pref_value?: Json
          updated_at?: string
        }
        Update: {
          user_id?: string
          pref_key?: string
          pref_value?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calculate_labor_cost: {
        Args: {
          p_end_date?: string
          p_project_id: string
          p_start_date?: string
        }
        Returns: number
      }
      calculate_margin: {
        Args: {
          p_end_date?: string
          p_project_id: string
          p_start_date?: string
        }
        Returns: number
      }
      calculate_result: {
        Args: {
          p_end_date?: string
          p_project_id: string
          p_start_date?: string
        }
        Returns: number
      }
      calculate_tax: { Args: { p_project_id: string }; Returns: number }
      get_aggregated_financial_summary: {
        Args: never
        Returns: {
          total_indirect_cost: number
          total_labor_cost: number
          total_margin: number
          total_result: number
          total_revenue: number
          total_tax: number
        }[]
      }
      get_hourly_rate_for_date: {
        Args: { p_date: string; p_professional_id: string }
        Returns: number
      }
      get_project_financial_summary: {
        Args: { p_project_id: string }
        Returns: {
          contracted_revenue: number
          indirect_cost: number
          labor_cost: number
          margin: number
          project_id: string
          project_name: string
          result: number
          tax: number
        }[]
      }
      is_admin: { Args: { user_id: string }; Returns: boolean }
      approve_time_entry: {
        Args: { p_entry_id: string }
        Returns: { id: string; approval_status: string }[]
      }
      reject_time_entry: {
        Args: { p_entry_id: string; p_reason: string }
        Returns: { id: string; approval_status: string }[]
      }
      batch_approve_time_entries: {
        Args: { p_entry_ids: string[] }
        Returns: { entry_id: string; status: string; error: string | null }[]
      }
      batch_reject_time_entries: {
        Args: { p_entry_ids: string[]; p_reason: string }
        Returns: { entry_id: string; status: string; error: string | null }[]
      }
      close_accounting_period: {
        Args: { p_period_key: string }
        Returns: { period_key: string; status: string }[]
      }
      reopen_accounting_period: {
        Args: { p_period_key: string }
        Returns: { period_key: string; status: string }[]
      }
      is_period_closed: { Args: { p_date: string }; Returns: boolean }
      write_audit_log: {
        Args: {
          p_action: string
          p_entity_type: string
          p_entity_id?: string | null
          p_before_data?: Json | null
          p_after_data?: Json | null
          p_metadata?: Json | null
        }
        Returns: undefined
      }
      create_notification: {
        Args: {
          p_user_id: string
          p_type: string
          p_title: string
          p_body?: string | null
          p_entity_type?: string | null
          p_entity_id?: string | null
        }
        Returns: string
      }
      process_recurring_time_entries: {
        Args: { p_run_date?: string }
        Returns: {
          rule_id: string
          entry_id: string | null
          status: string
          error: string | null
        }[]
      }
      touch_updated_at: { Args: Record<string, never>; Returns: never }
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

