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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      contractor_photos: {
        Row: {
          contractor_id: string
          created_at: string
          description: string | null
          display_order: number
          id: string
          is_featured: boolean
          photo_url: string
          project_name: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          contractor_id: string
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_featured?: boolean
          photo_url: string
          project_name?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          contractor_id?: string
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_featured?: boolean
          photo_url?: string
          project_name?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contractor_photos_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      contracts: {
        Row: {
          client_email: string
          client_name: string
          client_phone: string | null
          contract_value: number
          contractor_id: string
          created_at: string
          end_date: string | null
          id: string
          project_description: string
          project_title: string
          start_date: string
          status: string
          terms: string | null
          updated_at: string
        }
        Insert: {
          client_email: string
          client_name: string
          client_phone?: string | null
          contract_value: number
          contractor_id: string
          created_at?: string
          end_date?: string | null
          id?: string
          project_description: string
          project_title: string
          start_date: string
          status?: string
          terms?: string | null
          updated_at?: string
        }
        Update: {
          client_email?: string
          client_name?: string
          client_phone?: string | null
          contract_value?: number
          contractor_id?: string
          created_at?: string
          end_date?: string | null
          id?: string
          project_description?: string
          project_title?: string
          start_date?: string
          status?: string
          terms?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contracts_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      marketplace_listings: {
        Row: {
          category: string
          condition: string
          created_at: string
          description: string
          id: string
          images: string[] | null
          is_active: boolean
          location: string
          price: number
          quantity: string
          seller_id: string
          title: string
          updated_at: string
        }
        Insert: {
          category: string
          condition: string
          created_at?: string
          description: string
          id?: string
          images?: string[] | null
          is_active?: boolean
          location: string
          price: number
          quantity: string
          seller_id: string
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          condition?: string
          created_at?: string
          description?: string
          id?: string
          images?: string[] | null
          is_active?: boolean
          location?: string
          price?: number
          quantity?: string
          seller_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          company_name: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          ts_profile_code: string | null
          updated_at: string
          user_id: string
          user_type: Database["public"]["Enums"]["user_type"]
        }
        Insert: {
          company_name?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          ts_profile_code?: string | null
          updated_at?: string
          user_id: string
          user_type?: Database["public"]["Enums"]["user_type"]
        }
        Update: {
          company_name?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          ts_profile_code?: string | null
          updated_at?: string
          user_id?: string
          user_type?: Database["public"]["Enums"]["user_type"]
        }
        Relationships: []
      }
      quote_form_templates: {
        Row: {
          contractor_id: string
          created_at: string
          fields: Json
          id: string
          is_active: boolean
          template_name: string
          updated_at: string
        }
        Insert: {
          contractor_id: string
          created_at?: string
          fields?: Json
          id?: string
          is_active?: boolean
          template_name?: string
          updated_at?: string
        }
        Update: {
          contractor_id?: string
          created_at?: string
          fields?: Json
          id?: string
          is_active?: boolean
          template_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_form_templates_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      quotes: {
        Row: {
          additional_details: Json | null
          budget_range: string | null
          contractor_id: string
          created_at: string
          customer_email: string
          customer_name: string
          customer_phone: string | null
          id: string
          project_description: string
          project_location: string | null
          project_title: string
          status: string | null
          timeline: string | null
          updated_at: string
        }
        Insert: {
          additional_details?: Json | null
          budget_range?: string | null
          contractor_id: string
          created_at?: string
          customer_email: string
          customer_name: string
          customer_phone?: string | null
          id?: string
          project_description: string
          project_location?: string | null
          project_title: string
          status?: string | null
          timeline?: string | null
          updated_at?: string
        }
        Update: {
          additional_details?: Json | null
          budget_range?: string | null
          contractor_id?: string
          created_at?: string
          customer_email?: string
          customer_name?: string
          customer_phone?: string | null
          id?: string
          project_description?: string
          project_location?: string | null
          project_title?: string
          status?: string | null
          timeline?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotes_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      team_members: {
        Row: {
          contractor_id: string
          created_at: string
          email: string
          full_name: string
          hourly_rate: number | null
          id: string
          is_active: boolean
          phone: string | null
          role: string
          updated_at: string
        }
        Insert: {
          contractor_id: string
          created_at?: string
          email: string
          full_name: string
          hourly_rate?: number | null
          id?: string
          is_active?: boolean
          phone?: string | null
          role: string
          updated_at?: string
        }
        Update: {
          contractor_id?: string
          created_at?: string
          email?: string
          full_name?: string
          hourly_rate?: number | null
          id?: string
          is_active?: boolean
          phone?: string | null
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      timesheets: {
        Row: {
          contractor_id: string
          created_at: string
          date: string
          description: string | null
          hours_worked: number
          id: string
          project_name: string
          status: string
          team_member_id: string | null
          updated_at: string
        }
        Insert: {
          contractor_id: string
          created_at?: string
          date: string
          description?: string | null
          hours_worked: number
          id?: string
          project_name: string
          status?: string
          team_member_id?: string | null
          updated_at?: string
        }
        Update: {
          contractor_id?: string
          created_at?: string
          date?: string
          description?: string | null
          hours_worked?: number
          id?: string
          project_name?: string
          status?: string
          team_member_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "timesheets_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "timesheets_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_ts_profile_code: { Args: never; Returns: string }
    }
    Enums: {
      user_type: "pro" | "standard"
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
    Enums: {
      user_type: ["pro", "standard"],
    },
  },
} as const
