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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      admin_activity_log: {
        Row: {
          action: string
          admin_id: string | null
          created_at: string | null
          details: Json | null
          id: string
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          admin_id?: string | null
          created_at?: string | null
          details?: Json | null
          id?: string
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          admin_id?: string | null
          created_at?: string | null
          details?: Json | null
          id?: string
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_activity_log_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_users: {
        Row: {
          created_at: string | null
          email: string
          full_name: string | null
          id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          email: string
          full_name?: string | null
          id?: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      assets: {
        Row: {
          category: Database["public"]["Enums"]["asset_category"]
          company_id: string
          created_at: string | null
          description: string | null
          id: string
          install_date: string | null
          is_active: boolean | null
          last_serviced: string | null
          location_note: string | null
          make: string | null
          model: string | null
          name: string
          next_service_due: string | null
          reference: string | null
          serial_number: string | null
          site_id: string
          status: string
          updated_at: string | null
          warranty_expiry: string | null
        }
        Insert: {
          category: Database["public"]["Enums"]["asset_category"]
          company_id: string
          created_at?: string | null
          description?: string | null
          id?: string
          install_date?: string | null
          is_active?: boolean | null
          last_serviced?: string | null
          location_note?: string | null
          make?: string | null
          model?: string | null
          name: string
          next_service_due?: string | null
          reference?: string | null
          serial_number?: string | null
          site_id: string
          status?: string
          updated_at?: string | null
          warranty_expiry?: string | null
        }
        Update: {
          category?: Database["public"]["Enums"]["asset_category"]
          company_id?: string
          created_at?: string | null
          description?: string | null
          id?: string
          install_date?: string | null
          is_active?: boolean | null
          last_serviced?: string | null
          location_note?: string | null
          make?: string | null
          model?: string | null
          name?: string
          next_service_due?: string | null
          reference?: string | null
          serial_number?: string | null
          site_id?: string
          status?: string
          updated_at?: string | null
          warranty_expiry?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      availability_slots: {
        Row: {
          contractor_id: string
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          is_available: boolean
          start_time: string
          updated_at: string
        }
        Insert: {
          contractor_id: string
          created_at?: string
          day_of_week: number
          end_time?: string
          id?: string
          is_available?: boolean
          start_time?: string
          updated_at?: string
        }
        Update: {
          contractor_id?: string
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          is_available?: boolean
          start_time?: string
          updated_at?: string
        }
        Relationships: []
      }
      broadcast_emails: {
        Row: {
          audience_filters: Json | null
          audience_type: string
          body: string
          created_at: string | null
          created_by: string | null
          cta_label: string | null
          cta_url: string | null
          id: string
          recipient_count: number | null
          scheduled_at: string | null
          sent_at: string | null
          subject: string
        }
        Insert: {
          audience_filters?: Json | null
          audience_type: string
          body: string
          created_at?: string | null
          created_by?: string | null
          cta_label?: string | null
          cta_url?: string | null
          id?: string
          recipient_count?: number | null
          scheduled_at?: string | null
          sent_at?: string | null
          subject: string
        }
        Update: {
          audience_filters?: Json | null
          audience_type?: string
          body?: string
          created_at?: string | null
          created_by?: string | null
          cta_label?: string | null
          cta_url?: string | null
          id?: string
          recipient_count?: number | null
          scheduled_at?: string | null
          sent_at?: string | null
          subject?: string
        }
        Relationships: []
      }
      business_counters: {
        Row: {
          company_id: string
          entity: string
          next_value: number
        }
        Insert: {
          company_id: string
          entity: string
          next_value?: number
        }
        Update: {
          company_id?: string
          entity?: string
          next_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "business_counters_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      business_members: {
        Row: {
          accepted_at: string | null
          company_id: string
          coverage_group_id: string | null
          coverage_kind: string
          coverage_site_id: string | null
          created_at: string | null
          id: string
          invite_expires_at: string | null
          invite_token: string | null
          invited_email: string | null
          profile_id: string | null
          status: string
        }
        Insert: {
          accepted_at?: string | null
          company_id: string
          coverage_group_id?: string | null
          coverage_kind: string
          coverage_site_id?: string | null
          created_at?: string | null
          id?: string
          invite_expires_at?: string | null
          invite_token?: string | null
          invited_email?: string | null
          profile_id?: string | null
          status?: string
        }
        Update: {
          accepted_at?: string | null
          company_id?: string
          coverage_group_id?: string | null
          coverage_kind?: string
          coverage_site_id?: string | null
          created_at?: string | null
          id?: string
          invite_expires_at?: string | null
          invite_token?: string | null
          invited_email?: string | null
          profile_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_members_coverage_group_id_fkey"
            columns: ["coverage_group_id"]
            isOneToOne: false
            referencedRelation: "site_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_members_coverage_site_id_fkey"
            columns: ["coverage_site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "public_pro_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address: string | null
          address_line1: string | null
          address_line2: string | null
          city: string | null
          company_code: string
          company_size: string | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string | null
          email: string | null
          id: string
          industry: string | null
          logo_url: string | null
          name: string
          owner_id: string
          phone: string | null
          postcode: string | null
          sourcing_policy: string
          updated_at: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          company_code: string
          company_size?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          industry?: string | null
          logo_url?: string | null
          name: string
          owner_id: string
          phone?: string | null
          postcode?: string | null
          sourcing_policy?: string
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          company_code?: string
          company_size?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          industry?: string | null
          logo_url?: string | null
          name?: string
          owner_id?: string
          phone?: string | null
          postcode?: string | null
          sourcing_policy?: string
          updated_at?: string | null
          website?: string | null
        }
        Relationships: []
      }
      compliance_items: {
        Row: {
          alert_sent: boolean | null
          contractor_id: string | null
          created_at: string | null
          document_url: string | null
          expiry_date: string
          id: string
          issued_date: string | null
          issuing_body: string | null
          name: string
          reference_number: string | null
          status: string | null
          type: string
          updated_at: string | null
        }
        Insert: {
          alert_sent?: boolean | null
          contractor_id?: string | null
          created_at?: string | null
          document_url?: string | null
          expiry_date: string
          id?: string
          issued_date?: string | null
          issuing_body?: string | null
          name: string
          reference_number?: string | null
          status?: string | null
          type: string
          updated_at?: string | null
        }
        Update: {
          alert_sent?: boolean | null
          contractor_id?: string | null
          created_at?: string | null
          document_url?: string | null
          expiry_date?: string
          id?: string
          issued_date?: string | null
          issuing_body?: string | null
          name?: string
          reference_number?: string | null
          status?: string | null
          type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      contractor_availability_overrides: {
        Row: {
          am_available: boolean
          contractor_id: string
          created_at: string | null
          date: string
          id: string
          pm_available: boolean
          reason: string | null
        }
        Insert: {
          am_available?: boolean
          contractor_id: string
          created_at?: string | null
          date: string
          id?: string
          pm_available?: boolean
          reason?: string | null
        }
        Update: {
          am_available?: boolean
          contractor_id?: string
          created_at?: string | null
          date?: string
          id?: string
          pm_available?: boolean
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contractor_availability_overrides_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_availability_overrides_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "public_pro_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contractor_counters: {
        Row: {
          contractor_id: string
          entity: string
          next_value: number
        }
        Insert: {
          contractor_id: string
          entity: string
          next_value?: number
        }
        Update: {
          contractor_id?: string
          entity?: string
          next_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "contractor_counters_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_counters_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "public_pro_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contractor_credentials: {
        Row: {
          contractor_id: string
          created_at: string | null
          display_order: number | null
          id: string
          issuer: string | null
          name: string
          reference_number: string | null
          updated_at: string | null
          verified: boolean | null
        }
        Insert: {
          contractor_id: string
          created_at?: string | null
          display_order?: number | null
          id?: string
          issuer?: string | null
          name: string
          reference_number?: string | null
          updated_at?: string | null
          verified?: boolean | null
        }
        Update: {
          contractor_id?: string
          created_at?: string | null
          display_order?: number | null
          id?: string
          issuer?: string | null
          name?: string
          reference_number?: string | null
          updated_at?: string | null
          verified?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "contractor_credentials_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_credentials_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "public_pro_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contractor_documents: {
        Row: {
          contractor_id: string
          created_at: string
          description: string | null
          display_order: number
          document_url: string
          file_name: string
          file_size: number | null
          id: string
          title: string
          updated_at: string
        }
        Insert: {
          contractor_id: string
          created_at?: string
          description?: string | null
          display_order?: number
          document_url: string
          file_name: string
          file_size?: number | null
          id?: string
          title: string
          updated_at?: string
        }
        Update: {
          contractor_id?: string
          created_at?: string
          description?: string | null
          display_order?: number
          document_url?: string
          file_name?: string
          file_size?: number | null
          id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contractor_documents_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "contractor_documents_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "public_pro_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      contractor_panel: {
        Row: {
          added_by: string | null
          approved_at: string | null
          can_receive_jobs: boolean
          company_id: string | null
          contractor_id: string | null
          created_at: string | null
          id: string
          notes: string | null
          prequal_id: string | null
          prequal_status: string
          status: string | null
          tier: string | null
          updated_at: string | null
        }
        Insert: {
          added_by?: string | null
          approved_at?: string | null
          can_receive_jobs?: boolean
          company_id?: string | null
          contractor_id?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          prequal_id?: string | null
          prequal_status?: string
          status?: string | null
          tier?: string | null
          updated_at?: string | null
        }
        Update: {
          added_by?: string | null
          approved_at?: string | null
          can_receive_jobs?: boolean
          company_id?: string | null
          contractor_id?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          prequal_id?: string | null
          prequal_status?: string
          status?: string | null
          tier?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contractor_panel_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_panel_prequal_id_fkey"
            columns: ["prequal_id"]
            isOneToOne: false
            referencedRelation: "panel_prequalification"
            referencedColumns: ["id"]
          },
        ]
      }
      contractor_photo_galleries: {
        Row: {
          contractor_id: string
          created_at: string | null
          display_order: number
          id: string
          is_enabled: boolean
          title: string
          updated_at: string | null
        }
        Insert: {
          contractor_id: string
          created_at?: string | null
          display_order?: number
          id?: string
          is_enabled?: boolean
          title?: string
          updated_at?: string | null
        }
        Update: {
          contractor_id?: string
          created_at?: string | null
          display_order?: number
          id?: string
          is_enabled?: boolean
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contractor_photo_galleries_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_photo_galleries_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "public_pro_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contractor_photos: {
        Row: {
          contractor_id: string
          created_at: string
          description: string | null
          display_order: number
          gallery_id: string | null
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
          gallery_id?: string | null
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
          gallery_id?: string | null
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
          {
            foreignKeyName: "contractor_photos_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "public_pro_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "contractor_photos_gallery_id_fkey"
            columns: ["gallery_id"]
            isOneToOne: false
            referencedRelation: "contractor_photo_galleries"
            referencedColumns: ["id"]
          },
        ]
      }
      contractor_projects: {
        Row: {
          completed_date: string | null
          contractor_id: string
          created_at: string | null
          description: string | null
          display_order: number
          id: string
          photos: string[] | null
          title: string
          updated_at: string | null
          value_label: string | null
        }
        Insert: {
          completed_date?: string | null
          contractor_id: string
          created_at?: string | null
          description?: string | null
          display_order?: number
          id?: string
          photos?: string[] | null
          title: string
          updated_at?: string | null
          value_label?: string | null
        }
        Update: {
          completed_date?: string | null
          contractor_id?: string
          created_at?: string | null
          description?: string | null
          display_order?: number
          id?: string
          photos?: string[] | null
          title?: string
          updated_at?: string | null
          value_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contractor_projects_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_projects_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "public_pro_profiles"
            referencedColumns: ["id"]
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
          {
            foreignKeyName: "contracts_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "public_pro_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      crm_activities: {
        Row: {
          activity_date: string
          activity_type: string
          client_id: string
          contractor_id: string
          created_at: string
          description: string | null
          id: string
          title: string
        }
        Insert: {
          activity_date?: string
          activity_type?: string
          client_id: string
          contractor_id: string
          created_at?: string
          description?: string | null
          id?: string
          title: string
        }
        Update: {
          activity_date?: string
          activity_type?: string
          client_id?: string
          contractor_id?: string
          created_at?: string
          description?: string | null
          id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_activities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "crm_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_clients: {
        Row: {
          address: string | null
          company_name: string | null
          contractor_id: string
          created_at: string
          email: string | null
          full_name: string
          id: string
          notes: string | null
          phone: string | null
          profile_id: string | null
          source: string | null
          status: string
          total_revenue: number
          updated_at: string
        }
        Insert: {
          address?: string | null
          company_name?: string | null
          contractor_id: string
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          notes?: string | null
          phone?: string | null
          profile_id?: string | null
          source?: string | null
          status?: string
          total_revenue?: number
          updated_at?: string
        }
        Update: {
          address?: string | null
          company_name?: string | null
          contractor_id?: string
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          notes?: string | null
          phone?: string | null
          profile_id?: string | null
          source?: string | null
          status?: string
          total_revenue?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_clients_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_clients_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "public_pro_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      disputes: {
        Row: {
          created_at: string | null
          id: string
          job_id: string | null
          notes: string | null
          raised_by: string | null
          resolved_at: string | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          job_id?: string | null
          notes?: string | null
          raised_by?: string | null
          resolved_at?: string | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          job_id?: string | null
          notes?: string | null
          raised_by?: string | null
          resolved_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "disputes_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_raised_by_fkey"
            columns: ["raised_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_raised_by_fkey"
            columns: ["raised_by"]
            isOneToOne: false
            referencedRelation: "public_pro_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      engagement_notes: {
        Row: {
          content: string
          contractor_id: string
          created_at: string
          enquiry_id: string | null
          id: string
          issued_quote_id: string | null
          job_id: string | null
          updated_at: string
        }
        Insert: {
          content: string
          contractor_id: string
          created_at?: string
          enquiry_id?: string | null
          id?: string
          issued_quote_id?: string | null
          job_id?: string | null
          updated_at?: string
        }
        Update: {
          content?: string
          contractor_id?: string
          created_at?: string
          enquiry_id?: string | null
          id?: string
          issued_quote_id?: string | null
          job_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "engagement_notes_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_notes_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "public_pro_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_notes_enquiry_id_fkey"
            columns: ["enquiry_id"]
            isOneToOne: false
            referencedRelation: "enquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_notes_issued_quote_id_fkey"
            columns: ["issued_quote_id"]
            isOneToOne: false
            referencedRelation: "issued_quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_notes_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      enquiries: {
        Row: {
          additional_details: string | null
          asset_id: string | null
          budget_range: string | null
          company_id: string | null
          contractor_id: string | null
          created_at: string | null
          customer_email: string | null
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          customer_ts_code: string | null
          id: string
          job_description: string
          job_type: string | null
          location: string
          photo_urls: string[] | null
          preferred_timeline: string | null
          priority: string | null
          project_id: string | null
          site_id: string | null
          status: string | null
          title: string | null
          trade: string | null
          updated_at: string | null
        }
        Insert: {
          additional_details?: string | null
          asset_id?: string | null
          budget_range?: string | null
          company_id?: string | null
          contractor_id?: string | null
          created_at?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          customer_ts_code?: string | null
          id?: string
          job_description: string
          job_type?: string | null
          location: string
          photo_urls?: string[] | null
          preferred_timeline?: string | null
          priority?: string | null
          project_id?: string | null
          site_id?: string | null
          status?: string | null
          title?: string | null
          trade?: string | null
          updated_at?: string | null
        }
        Update: {
          additional_details?: string | null
          asset_id?: string | null
          budget_range?: string | null
          company_id?: string | null
          contractor_id?: string | null
          created_at?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          customer_ts_code?: string | null
          id?: string
          job_description?: string
          job_type?: string | null
          location?: string
          photo_urls?: string[] | null
          preferred_timeline?: string | null
          priority?: string | null
          project_id?: string | null
          site_id?: string | null
          status?: string | null
          title?: string | null
          trade?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "enquiries_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enquiries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enquiries_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enquiries_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "public_pro_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enquiries_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enquiries_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "public_pro_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enquiries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enquiries_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      enquiry_measurements: {
        Row: {
          created_at: string
          enquiry_id: string
          id: string
          label: string
          sort_order: number | null
          unit: string | null
          value: string
        }
        Insert: {
          created_at?: string
          enquiry_id: string
          id?: string
          label: string
          sort_order?: number | null
          unit?: string | null
          value: string
        }
        Update: {
          created_at?: string
          enquiry_id?: string
          id?: string
          label?: string
          sort_order?: number | null
          unit?: string | null
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "enquiry_measurements_enquiry_id_fkey"
            columns: ["enquiry_id"]
            isOneToOne: false
            referencedRelation: "enquiries"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category: string
          contractor_id: string
          created_at: string
          description: string
          expense_date: string
          id: string
          is_recurring: boolean
          job_id: string | null
          notes: string | null
          project_id: string | null
          receipt_url: string | null
          updated_at: string
          vat_amount: number | null
          vat_reclaimable: boolean | null
          vendor: string | null
        }
        Insert: {
          amount: number
          category?: string
          contractor_id: string
          created_at?: string
          description: string
          expense_date?: string
          id?: string
          is_recurring?: boolean
          job_id?: string | null
          notes?: string | null
          project_id?: string | null
          receipt_url?: string | null
          updated_at?: string
          vat_amount?: number | null
          vat_reclaimable?: boolean | null
          vendor?: string | null
        }
        Update: {
          amount?: number
          category?: string
          contractor_id?: string
          created_at?: string
          description?: string
          expense_date?: string
          id?: string
          is_recurring?: boolean
          job_id?: string | null
          notes?: string | null
          project_id?: string | null
          receipt_url?: string | null
          updated_at?: string
          vat_amount?: number | null
          vat_reclaimable?: boolean | null
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      favourites: {
        Row: {
          contractor_id: string | null
          created_at: string | null
          id: string
          user_id: string | null
        }
        Insert: {
          contractor_id?: string | null
          created_at?: string | null
          id?: string
          user_id?: string | null
        }
        Update: {
          contractor_id?: string | null
          created_at?: string | null
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "favourites_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favourites_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "public_pro_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favourites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favourites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_pro_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_announcements: {
        Row: {
          applies_to: string[]
          description: string | null
          id: string
          released_at: string
          title: string
        }
        Insert: {
          applies_to: string[]
          description?: string | null
          id?: string
          released_at?: string
          title: string
        }
        Update: {
          applies_to?: string[]
          description?: string | null
          id?: string
          released_at?: string
          title?: string
        }
        Relationships: []
      }
      gdpr_erasure_log: {
        Row: {
          completed_at: string | null
          created_at: string | null
          id: string
          notes: string | null
          performed_by: string | null
          requested_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          performed_by?: string | null
          requested_at: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          performed_by?: string | null
          requested_at?: string
          user_id?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          amount_due: number | null
          client_address: string | null
          client_email: string
          client_name: string
          client_phone: string | null
          contractor_id: string
          created_at: string
          deposit_amount: number | null
          deposit_deducted: number | null
          deposit_paid: boolean | null
          deposit_paid_at: string | null
          due_date: string
          id: string
          invoice_number: number
          issued_date: string
          items: Json
          job_id: string | null
          notes: string | null
          paid_date: string | null
          project_id: string | null
          quote_id: string | null
          recipient_id: string | null
          recipient_response: string | null
          responded_at: string | null
          sent_at: string | null
          status: string
          stripe_payment_intent_id: string | null
          subtotal: number
          tax_amount: number
          tax_rate: number
          total: number
          updated_at: string
          viewed_at: string | null
        }
        Insert: {
          amount_due?: number | null
          client_address?: string | null
          client_email: string
          client_name: string
          client_phone?: string | null
          contractor_id: string
          created_at?: string
          deposit_amount?: number | null
          deposit_deducted?: number | null
          deposit_paid?: boolean | null
          deposit_paid_at?: string | null
          due_date: string
          id?: string
          invoice_number: number
          issued_date?: string
          items?: Json
          job_id?: string | null
          notes?: string | null
          paid_date?: string | null
          project_id?: string | null
          quote_id?: string | null
          recipient_id?: string | null
          recipient_response?: string | null
          responded_at?: string | null
          sent_at?: string | null
          status?: string
          stripe_payment_intent_id?: string | null
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          total?: number
          updated_at?: string
          viewed_at?: string | null
        }
        Update: {
          amount_due?: number | null
          client_address?: string | null
          client_email?: string
          client_name?: string
          client_phone?: string | null
          contractor_id?: string
          created_at?: string
          deposit_amount?: number | null
          deposit_deducted?: number | null
          deposit_paid?: boolean | null
          deposit_paid_at?: string | null
          due_date?: string
          id?: string
          invoice_number?: number
          issued_date?: string
          items?: Json
          job_id?: string | null
          notes?: string | null
          paid_date?: string | null
          project_id?: string | null
          quote_id?: string | null
          recipient_id?: string | null
          recipient_response?: string | null
          responded_at?: string | null
          sent_at?: string | null
          status?: string
          stripe_payment_intent_id?: string | null
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          total?: number
          updated_at?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "issued_quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "invoices_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "public_pro_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      issued_quotes: {
        Row: {
          accepted_at: string | null
          business_name: string | null
          client_address: string | null
          client_email: string
          client_name: string
          client_phone: string | null
          client_type: string
          completion_time: string | null
          contractor_id: string
          created_at: string
          customer_note: string | null
          deposit_amount: number | null
          deposit_paid: boolean | null
          deposit_paid_at: string | null
          deposit_percentage: number | null
          deposit_required: boolean | null
          description: string | null
          enquiry_id: string | null
          estimated_duration_minutes: number | null
          id: string
          items: Json
          notes: string | null
          parent_quote_id: string | null
          project_id: string | null
          quote_number: number
          recipient_id: string | null
          recipient_response: string | null
          rejected_at: string | null
          responded_at: string | null
          sent_at: string | null
          status: string
          subtotal: number
          tax_amount: number
          tax_rate: number
          terms: string | null
          title: string
          total: number
          updated_at: string
          valid_until: string
          version: number
          viewed_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          business_name?: string | null
          client_address?: string | null
          client_email: string
          client_name: string
          client_phone?: string | null
          client_type?: string
          completion_time?: string | null
          contractor_id: string
          created_at?: string
          customer_note?: string | null
          deposit_amount?: number | null
          deposit_paid?: boolean | null
          deposit_paid_at?: string | null
          deposit_percentage?: number | null
          deposit_required?: boolean | null
          description?: string | null
          enquiry_id?: string | null
          estimated_duration_minutes?: number | null
          id?: string
          items?: Json
          notes?: string | null
          parent_quote_id?: string | null
          project_id?: string | null
          quote_number: number
          recipient_id?: string | null
          recipient_response?: string | null
          rejected_at?: string | null
          responded_at?: string | null
          sent_at?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          terms?: string | null
          title: string
          total?: number
          updated_at?: string
          valid_until: string
          version?: number
          viewed_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          business_name?: string | null
          client_address?: string | null
          client_email?: string
          client_name?: string
          client_phone?: string | null
          client_type?: string
          completion_time?: string | null
          contractor_id?: string
          created_at?: string
          customer_note?: string | null
          deposit_amount?: number | null
          deposit_paid?: boolean | null
          deposit_paid_at?: string | null
          deposit_percentage?: number | null
          deposit_required?: boolean | null
          description?: string | null
          enquiry_id?: string | null
          estimated_duration_minutes?: number | null
          id?: string
          items?: Json
          notes?: string | null
          parent_quote_id?: string | null
          project_id?: string | null
          quote_number?: number
          recipient_id?: string | null
          recipient_response?: string | null
          rejected_at?: string | null
          responded_at?: string | null
          sent_at?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          terms?: string | null
          title?: string
          total?: number
          updated_at?: string
          valid_until?: string
          version?: number
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "issued_quotes_enquiry_id_fkey"
            columns: ["enquiry_id"]
            isOneToOne: false
            referencedRelation: "enquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issued_quotes_parent_quote_id_fkey"
            columns: ["parent_quote_id"]
            isOneToOne: false
            referencedRelation: "issued_quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issued_quotes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issued_quotes_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issued_quotes_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "public_pro_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_assignments: {
        Row: {
          created_at: string
          id: string
          is_contractor: boolean
          job_id: string
          team_member_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_contractor?: boolean
          job_id: string
          team_member_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_contractor?: boolean
          job_id?: string
          team_member_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_assignments_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_assignments_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      job_checklist_items: {
        Row: {
          checked_at: string | null
          checked_by: string | null
          created_at: string
          id: string
          is_checked: boolean
          is_contractor_added: boolean
          item_text: string
          job_id: string
          sort_order: number
          stage: string
        }
        Insert: {
          checked_at?: string | null
          checked_by?: string | null
          created_at?: string
          id?: string
          is_checked?: boolean
          is_contractor_added?: boolean
          item_text: string
          job_id: string
          sort_order?: number
          stage: string
        }
        Update: {
          checked_at?: string | null
          checked_by?: string | null
          created_at?: string
          id?: string
          is_checked?: boolean
          is_contractor_added?: boolean
          item_text?: string
          job_id?: string
          sort_order?: number
          stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_checklist_items_checked_by_fkey"
            columns: ["checked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_checklist_items_checked_by_fkey"
            columns: ["checked_by"]
            isOneToOne: false
            referencedRelation: "public_pro_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_checklist_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_checklist_templates: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          is_active: boolean
          item_text: string
          job_type: string
          sort_order: number
          stage: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          item_text: string
          job_type: string
          sort_order?: number
          stage: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          item_text?: string
          job_type?: string
          sort_order?: number
          stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_checklist_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      job_conversations: {
        Row: {
          context: string
          created_at: string
          enquiry_id: string | null
          id: string
          issued_quote_id: string | null
          job_id: string | null
        }
        Insert: {
          context?: string
          created_at?: string
          enquiry_id?: string | null
          id?: string
          issued_quote_id?: string | null
          job_id?: string | null
        }
        Update: {
          context?: string
          created_at?: string
          enquiry_id?: string | null
          id?: string
          issued_quote_id?: string | null
          job_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_conversations_enquiry_id_fkey"
            columns: ["enquiry_id"]
            isOneToOne: false
            referencedRelation: "enquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_conversations_issued_quote_id_fkey"
            columns: ["issued_quote_id"]
            isOneToOne: false
            referencedRelation: "issued_quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_conversations_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_message_notifications: {
        Row: {
          created_at: string
          id: string
          message_id: string
          notified_via_email: boolean
          notified_via_inapp: boolean
          recipient_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message_id: string
          notified_via_email?: boolean
          notified_via_inapp?: boolean
          recipient_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message_id?: string
          notified_via_email?: boolean
          notified_via_inapp?: boolean
          recipient_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_message_notifications_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "job_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_message_notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_message_notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "public_pro_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          message_type: string
          read_at: string | null
          sender_id: string
          sender_role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          message_type?: string
          read_at?: string | null
          sender_id: string
          sender_role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          message_type?: string
          read_at?: string | null
          sender_id?: string
          sender_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "job_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "public_pro_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_notes: {
        Row: {
          author_id: string
          content: string
          created_at: string
          id: string
          job_id: string
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          id?: string
          job_id: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          id?: string
          job_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_notes_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_photos: {
        Row: {
          caption: string | null
          created_at: string
          description: string | null
          enquiry_id: string | null
          file_type: string
          id: string
          job_id: string
          photo_approval_requested_at: string | null
          photo_approval_responded_at: string | null
          photo_approval_status: string
          photo_url: string
          portfolio: boolean
          stage_id: string | null
          storage_path: string | null
          tags: string[] | null
          title: string | null
          uploaded_by: string
          uploaded_by_role: string
          visibility: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          description?: string | null
          enquiry_id?: string | null
          file_type?: string
          id?: string
          job_id: string
          photo_approval_requested_at?: string | null
          photo_approval_responded_at?: string | null
          photo_approval_status?: string
          photo_url: string
          portfolio?: boolean
          stage_id?: string | null
          storage_path?: string | null
          tags?: string[] | null
          title?: string | null
          uploaded_by: string
          uploaded_by_role?: string
          visibility?: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          description?: string | null
          enquiry_id?: string | null
          file_type?: string
          id?: string
          job_id?: string
          photo_approval_requested_at?: string | null
          photo_approval_responded_at?: string | null
          photo_approval_status?: string
          photo_url?: string
          portfolio?: boolean
          stage_id?: string | null
          storage_path?: string | null
          tags?: string[] | null
          title?: string | null
          uploaded_by?: string
          uploaded_by_role?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_photos_enquiry_id_fkey"
            columns: ["enquiry_id"]
            isOneToOne: false
            referencedRelation: "enquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_photos_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_reviews: {
        Row: {
          client_id: string
          comment: string | null
          contractor_id: string
          created_at: string
          direction: string | null
          id: string
          job_id: string
          project_id: string | null
          rating: number
          reply: string | null
          reply_at: string | null
          verified: boolean | null
        }
        Insert: {
          client_id: string
          comment?: string | null
          contractor_id: string
          created_at?: string
          direction?: string | null
          id?: string
          job_id: string
          project_id?: string | null
          rating: number
          reply?: string | null
          reply_at?: string | null
          verified?: boolean | null
        }
        Update: {
          client_id?: string
          comment?: string | null
          contractor_id?: string
          created_at?: string
          direction?: string | null
          id?: string
          job_id?: string
          project_id?: string | null
          rating?: number
          reply?: string | null
          reply_at?: string | null
          verified?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "job_reviews_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_reviews_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      job_scheduling_proposals: {
        Row: {
          confirmed_date: string | null
          created_at: string | null
          id: string
          proposed_by: string | null
          proposed_dates: string[]
          quote_id: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          confirmed_date?: string | null
          created_at?: string | null
          id?: string
          proposed_by?: string | null
          proposed_dates: string[]
          quote_id?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          confirmed_date?: string | null
          created_at?: string | null
          id?: string
          proposed_by?: string | null
          proposed_dates?: string[]
          quote_id?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_scheduling_proposals_proposed_by_fkey"
            columns: ["proposed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_scheduling_proposals_proposed_by_fkey"
            columns: ["proposed_by"]
            isOneToOne: false
            referencedRelation: "public_pro_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_scheduling_proposals_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "issued_quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      job_snag_items: {
        Row: {
          created_at: string
          id: string
          is_resolved: boolean
          job_id: string
          photo_url: string | null
          project_id: string | null
          raised_by: string
          resolved_at: string | null
          resolved_by: string | null
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_resolved?: boolean
          job_id: string
          photo_url?: string | null
          project_id?: string | null
          raised_by: string
          resolved_at?: string | null
          resolved_by?: string | null
          title: string
        }
        Update: {
          created_at?: string
          id?: string
          is_resolved?: boolean
          job_id?: string
          photo_url?: string | null
          project_id?: string | null
          raised_by?: string
          resolved_at?: string | null
          resolved_by?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_snag_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_snag_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_snag_items_raised_by_fkey"
            columns: ["raised_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_snag_items_raised_by_fkey"
            columns: ["raised_by"]
            isOneToOne: false
            referencedRelation: "public_pro_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_snag_items_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_snag_items_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "public_pro_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_team_members: {
        Row: {
          actual_arrival: string | null
          actual_departure: string | null
          assigned_at: string
          date: string | null
          expected_arrival: string | null
          expected_departure: string | null
          id: string
          job_id: string
          notes: string | null
          role: string | null
          team_member_id: string
        }
        Insert: {
          actual_arrival?: string | null
          actual_departure?: string | null
          assigned_at?: string
          date?: string | null
          expected_arrival?: string | null
          expected_departure?: string | null
          id?: string
          job_id: string
          notes?: string | null
          role?: string | null
          team_member_id: string
        }
        Update: {
          actual_arrival?: string | null
          actual_departure?: string | null
          assigned_at?: string
          date?: string | null
          expected_arrival?: string | null
          expected_departure?: string | null
          id?: string
          job_id?: string
          notes?: string | null
          role?: string | null
          team_member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_team_members_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_team_members_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          actual_end: string | null
          actual_start: string | null
          asset_id: string | null
          company_id: string | null
          completed_at: string | null
          contract_value: number | null
          contractor_id: string
          contractor_signed_off_at: string | null
          contractor_signed_off_name: string | null
          created_at: string
          customer_id: string
          description: string | null
          end_date: string | null
          expected_completion: string | null
          id: string
          issued_quote_id: string | null
          job_number: number
          job_type: string | null
          location: string | null
          portfolio_approved: boolean | null
          priority: string | null
          project_id: string | null
          responded_at: string | null
          scheduled_start: string | null
          signed_off_at: string | null
          signed_off_by: string | null
          site_id: string | null
          sla_attendance_due: string | null
          sla_completion_due: string | null
          sla_resolution_due: string | null
          sla_response_due: string | null
          sla_rule_id: string | null
          sla_status: string | null
          start_date: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          actual_end?: string | null
          actual_start?: string | null
          asset_id?: string | null
          company_id?: string | null
          completed_at?: string | null
          contract_value?: number | null
          contractor_id: string
          contractor_signed_off_at?: string | null
          contractor_signed_off_name?: string | null
          created_at?: string
          customer_id: string
          description?: string | null
          end_date?: string | null
          expected_completion?: string | null
          id?: string
          issued_quote_id?: string | null
          job_number: number
          job_type?: string | null
          location?: string | null
          portfolio_approved?: boolean | null
          priority?: string | null
          project_id?: string | null
          responded_at?: string | null
          scheduled_start?: string | null
          signed_off_at?: string | null
          signed_off_by?: string | null
          site_id?: string | null
          sla_attendance_due?: string | null
          sla_completion_due?: string | null
          sla_resolution_due?: string | null
          sla_response_due?: string | null
          sla_rule_id?: string | null
          sla_status?: string | null
          start_date?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          actual_end?: string | null
          actual_start?: string | null
          asset_id?: string | null
          company_id?: string | null
          completed_at?: string | null
          contract_value?: number | null
          contractor_id?: string
          contractor_signed_off_at?: string | null
          contractor_signed_off_name?: string | null
          created_at?: string
          customer_id?: string
          description?: string | null
          end_date?: string | null
          expected_completion?: string | null
          id?: string
          issued_quote_id?: string | null
          job_number?: number
          job_type?: string | null
          location?: string | null
          portfolio_approved?: boolean | null
          priority?: string | null
          project_id?: string | null
          responded_at?: string | null
          scheduled_start?: string | null
          signed_off_at?: string | null
          signed_off_by?: string | null
          site_id?: string | null
          sla_attendance_due?: string | null
          sla_completion_due?: string | null
          sla_resolution_due?: string | null
          sla_response_due?: string | null
          sla_rule_id?: string | null
          sla_status?: string | null
          start_date?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "public_pro_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "public_pro_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_issued_quote_id_fkey"
            columns: ["issued_quote_id"]
            isOneToOne: true
            referencedRelation: "issued_quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_signed_off_by_fkey"
            columns: ["signed_off_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_signed_off_by_fkey"
            columns: ["signed_off_by"]
            isOneToOne: false
            referencedRelation: "public_pro_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_sla_rule_id_fkey"
            columns: ["sla_rule_id"]
            isOneToOne: false
            referencedRelation: "sla_rules"
            referencedColumns: ["id"]
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
        Relationships: [
          {
            foreignKeyName: "marketplace_listings_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "marketplace_listings_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "public_pro_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string
          reference_id: string | null
          reference_type: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          reference_id?: string | null
          reference_type?: string | null
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          reference_id?: string | null
          reference_type?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      panel_prequalification: {
        Row: {
          company_id: string
          contractor_id: string
          created_at: string
          employers_liability_expiry: string | null
          employers_liability_verified: boolean
          id: string
          nda_signed: boolean | null
          next_review_date: string | null
          notes: string | null
          overall_status: string
          public_liability_expiry: string | null
          public_liability_verified: boolean
          reviewed_at: string | null
          reviewed_by: string | null
          site_induction_complete: boolean
          terms_accepted: boolean
          trade_cert_expiry: string | null
          trade_cert_verified: boolean
          updated_at: string
        }
        Insert: {
          company_id: string
          contractor_id: string
          created_at?: string
          employers_liability_expiry?: string | null
          employers_liability_verified?: boolean
          id?: string
          nda_signed?: boolean | null
          next_review_date?: string | null
          notes?: string | null
          overall_status?: string
          public_liability_expiry?: string | null
          public_liability_verified?: boolean
          reviewed_at?: string | null
          reviewed_by?: string | null
          site_induction_complete?: boolean
          terms_accepted?: boolean
          trade_cert_expiry?: string | null
          trade_cert_verified?: boolean
          updated_at?: string
        }
        Update: {
          company_id?: string
          contractor_id?: string
          created_at?: string
          employers_liability_expiry?: string | null
          employers_liability_verified?: boolean
          id?: string
          nda_signed?: boolean | null
          next_review_date?: string | null
          notes?: string | null
          overall_status?: string
          public_liability_expiry?: string | null
          public_liability_verified?: boolean
          reviewed_at?: string | null
          reviewed_by?: string | null
          site_induction_complete?: boolean
          terms_accepted?: boolean
          trade_cert_expiry?: string | null
          trade_cert_verified?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "panel_prequalification_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "panel_prequalification_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "panel_prequalification_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "public_pro_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "panel_prequalification_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "panel_prequalification_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "public_pro_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          contractor_payout: number | null
          created_at: string | null
          escrow_released_at: string | null
          id: string
          invoice_id: string | null
          job_id: string | null
          notes: string | null
          payee_id: string | null
          payer_id: string | null
          platform_fee: number | null
          project_id: string | null
          released_by: string | null
          status: string | null
          stripe_payment_intent_id: string | null
          stripe_transfer_id: string | null
          type: string | null
          updated_at: string | null
        }
        Insert: {
          amount: number
          contractor_payout?: number | null
          created_at?: string | null
          escrow_released_at?: string | null
          id?: string
          invoice_id?: string | null
          job_id?: string | null
          notes?: string | null
          payee_id?: string | null
          payer_id?: string | null
          platform_fee?: number | null
          project_id?: string | null
          released_by?: string | null
          status?: string | null
          stripe_payment_intent_id?: string | null
          stripe_transfer_id?: string | null
          type?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number
          contractor_payout?: number | null
          created_at?: string | null
          escrow_released_at?: string | null
          id?: string
          invoice_id?: string | null
          job_id?: string | null
          notes?: string | null
          payee_id?: string | null
          payer_id?: string | null
          platform_fee?: number | null
          project_id?: string | null
          released_by?: string | null
          status?: string | null
          stripe_payment_intent_id?: string | null
          stripe_transfer_id?: string | null
          type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          key: string
          updated_at: string | null
          updated_by: string | null
          value: string
        }
        Insert: {
          key: string
          updated_at?: string | null
          updated_by?: string | null
          value: string
        }
        Update: {
          key?: string
          updated_at?: string | null
          updated_by?: string | null
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      prequalification_documents: {
        Row: {
          created_at: string
          document_type: string
          expiry_date: string | null
          file_name: string
          file_url: string
          id: string
          prequal_id: string
          uploaded_by: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          created_at?: string
          document_type: string
          expiry_date?: string | null
          file_name: string
          file_url: string
          id?: string
          prequal_id: string
          uploaded_by: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          created_at?: string
          document_type?: string
          expiry_date?: string | null
          file_name?: string
          file_url?: string
          id?: string
          prequal_id?: string
          uploaded_by?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prequalification_documents_prequal_id_fkey"
            columns: ["prequal_id"]
            isOneToOne: false
            referencedRelation: "panel_prequalification"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prequalification_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prequalification_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "public_pro_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prequalification_documents_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prequalification_documents_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "public_pro_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_widgets: {
        Row: {
          contractor_id: string
          created_at: string | null
          display_order: number
          id: string
          is_enabled: boolean
          is_published: boolean
          label: string | null
          meta: Json | null
          published_order: number | null
          section_instance_id: string | null
          section_ref_id: string | null
          updated_at: string | null
          widget_key: string
        }
        Insert: {
          contractor_id: string
          created_at?: string | null
          display_order?: number
          id?: string
          is_enabled?: boolean
          is_published?: boolean
          label?: string | null
          meta?: Json | null
          published_order?: number | null
          section_instance_id?: string | null
          section_ref_id?: string | null
          updated_at?: string | null
          widget_key: string
        }
        Update: {
          contractor_id?: string
          created_at?: string | null
          display_order?: number
          id?: string
          is_enabled?: boolean
          is_published?: boolean
          label?: string | null
          meta?: Json | null
          published_order?: number | null
          section_instance_id?: string | null
          section_ref_id?: string | null
          updated_at?: string | null
          widget_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_widgets_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_widgets_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "public_pro_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address: string | null
          availability_heading: string | null
          avatar_url: string | null
          bio: string | null
          bio_heading: string | null
          company_name: string | null
          completed_jobs: number | null
          cover_url: string | null
          created_at: string
          credentials_heading: string | null
          cta_label: string | null
          email: string | null
          full_name: string | null
          hourly_rate: number | null
          id: string
          is_active: boolean | null
          is_available: boolean | null
          is_verified: boolean | null
          location: string | null
          logo_url: string | null
          onboarding_completed: boolean | null
          onboarding_completed_at: string | null
          phone: string | null
          profile_is_published: boolean
          profile_published_at: string | null
          profile_seo_description: string | null
          profile_seo_title: string | null
          profile_vanity_slug: string | null
          profile_visibility_public: boolean
          rating: number | null
          review_count: number | null
          reviews_heading: string | null
          seo_description: string | null
          seo_title: string | null
          services_heading: string | null
          stripe_account_id: string | null
          team_heading: string | null
          trades: string[] | null
          ts_profile_code: string | null
          updated_at: string
          user_id: string
          user_type: Database["public"]["Enums"]["user_type"]
          vanity_slug: string | null
          vat_number: string | null
          vat_registered: boolean | null
          vat_registration_date: string | null
          visibility_public: boolean
          website: string | null
          working_radius: string | null
          years_experience: number | null
        }
        Insert: {
          address?: string | null
          availability_heading?: string | null
          avatar_url?: string | null
          bio?: string | null
          bio_heading?: string | null
          company_name?: string | null
          completed_jobs?: number | null
          cover_url?: string | null
          created_at?: string
          credentials_heading?: string | null
          cta_label?: string | null
          email?: string | null
          full_name?: string | null
          hourly_rate?: number | null
          id?: string
          is_active?: boolean | null
          is_available?: boolean | null
          is_verified?: boolean | null
          location?: string | null
          logo_url?: string | null
          onboarding_completed?: boolean | null
          onboarding_completed_at?: string | null
          phone?: string | null
          profile_is_published?: boolean
          profile_published_at?: string | null
          profile_seo_description?: string | null
          profile_seo_title?: string | null
          profile_vanity_slug?: string | null
          profile_visibility_public?: boolean
          rating?: number | null
          review_count?: number | null
          reviews_heading?: string | null
          seo_description?: string | null
          seo_title?: string | null
          services_heading?: string | null
          stripe_account_id?: string | null
          team_heading?: string | null
          trades?: string[] | null
          ts_profile_code?: string | null
          updated_at?: string
          user_id: string
          user_type?: Database["public"]["Enums"]["user_type"]
          vanity_slug?: string | null
          vat_number?: string | null
          vat_registered?: boolean | null
          vat_registration_date?: string | null
          visibility_public?: boolean
          website?: string | null
          working_radius?: string | null
          years_experience?: number | null
        }
        Update: {
          address?: string | null
          availability_heading?: string | null
          avatar_url?: string | null
          bio?: string | null
          bio_heading?: string | null
          company_name?: string | null
          completed_jobs?: number | null
          cover_url?: string | null
          created_at?: string
          credentials_heading?: string | null
          cta_label?: string | null
          email?: string | null
          full_name?: string | null
          hourly_rate?: number | null
          id?: string
          is_active?: boolean | null
          is_available?: boolean | null
          is_verified?: boolean | null
          location?: string | null
          logo_url?: string | null
          onboarding_completed?: boolean | null
          onboarding_completed_at?: string | null
          phone?: string | null
          profile_is_published?: boolean
          profile_published_at?: string | null
          profile_seo_description?: string | null
          profile_seo_title?: string | null
          profile_vanity_slug?: string | null
          profile_visibility_public?: boolean
          rating?: number | null
          review_count?: number | null
          reviews_heading?: string | null
          seo_description?: string | null
          seo_title?: string | null
          services_heading?: string | null
          stripe_account_id?: string | null
          team_heading?: string | null
          trades?: string[] | null
          ts_profile_code?: string | null
          updated_at?: string
          user_id?: string
          user_type?: Database["public"]["Enums"]["user_type"]
          vanity_slug?: string | null
          vat_number?: string | null
          vat_registered?: boolean | null
          vat_registration_date?: string | null
          visibility_public?: boolean
          website?: string | null
          working_radius?: string | null
          years_experience?: number | null
        }
        Relationships: []
      }
      project_change_requests: {
        Row: {
          client_response: string | null
          cost_impact: number | null
          created_at: string
          description: string
          id: string
          informal_acknowledged: boolean | null
          project_id: string
          responded_at: string | null
          status: string
          submitted_by: string
          timeline_impact_days: number | null
          updated_at: string
        }
        Insert: {
          client_response?: string | null
          cost_impact?: number | null
          created_at?: string
          description: string
          id?: string
          informal_acknowledged?: boolean | null
          project_id: string
          responded_at?: string | null
          status?: string
          submitted_by: string
          timeline_impact_days?: number | null
          updated_at?: string
        }
        Update: {
          client_response?: string | null
          cost_impact?: number | null
          created_at?: string
          description?: string
          id?: string
          informal_acknowledged?: boolean | null
          project_id?: string
          responded_at?: string | null
          status?: string
          submitted_by?: string
          timeline_impact_days?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_change_requests_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_change_requests_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_change_requests_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "public_pro_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      project_contracts: {
        Row: {
          change_request_id: string | null
          created_at: string
          document_url: string | null
          id: string
          project_id: string
          signed_by_client: boolean
          signed_by_contractor: boolean
          triggered_by: string
          version: number
        }
        Insert: {
          change_request_id?: string | null
          created_at?: string
          document_url?: string | null
          id?: string
          project_id: string
          signed_by_client?: boolean
          signed_by_contractor?: boolean
          triggered_by: string
          version?: number
        }
        Update: {
          change_request_id?: string | null
          created_at?: string
          document_url?: string | null
          id?: string
          project_id?: string
          signed_by_client?: boolean
          signed_by_contractor?: boolean
          triggered_by?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_contracts_change_request_id_fkey"
            columns: ["change_request_id"]
            isOneToOne: false
            referencedRelation: "project_change_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_contracts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_events: {
        Row: {
          actor_id: string
          created_at: string
          event_type: string
          id: string
          payload: Json | null
          project_id: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          event_type: string
          id?: string
          payload?: Json | null
          project_id: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json | null
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "public_pro_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_jobs: {
        Row: {
          created_at: string
          id: string
          job_id: string
          phase_order: number | null
          phase_title: string | null
          project_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          job_id: string
          phase_order?: number | null
          phase_title?: string | null
          project_id: string
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string
          phase_order?: number | null
          phase_title?: string | null
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_jobs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_members: {
        Row: {
          id: string
          joined_at: string | null
          profile_id: string
          project_id: string
          role: string
          status: string
        }
        Insert: {
          id?: string
          joined_at?: string | null
          profile_id: string
          project_id: string
          role?: string
          status?: string
        }
        Update: {
          id?: string
          joined_at?: string | null
          profile_id?: string
          project_id?: string
          role?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "public_pro_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_notes: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          project_id: string
          updated_at: string
          visibility: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          project_id: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          project_id?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "public_pro_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_notes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_proposals: {
        Row: {
          contractor_id: string
          id: string
          materials_responsibility: string | null
          payment_terms: string | null
          phases: Json | null
          project_id: string
          rejection_reason: string | null
          rejection_scores: Json | null
          status: string
          submitted_at: string | null
          timeline_end: string | null
          timeline_start: string | null
          total_cost: number | null
          updated_at: string
          version: number
          weighted_score: number | null
        }
        Insert: {
          contractor_id: string
          id?: string
          materials_responsibility?: string | null
          payment_terms?: string | null
          phases?: Json | null
          project_id: string
          rejection_reason?: string | null
          rejection_scores?: Json | null
          status?: string
          submitted_at?: string | null
          timeline_end?: string | null
          timeline_start?: string | null
          total_cost?: number | null
          updated_at?: string
          version?: number
          weighted_score?: number | null
        }
        Update: {
          contractor_id?: string
          id?: string
          materials_responsibility?: string | null
          payment_terms?: string | null
          phases?: Json | null
          project_id?: string
          rejection_reason?: string | null
          rejection_scores?: Json | null
          status?: string
          submitted_at?: string | null
          timeline_end?: string | null
          timeline_start?: string | null
          total_cost?: number | null
          updated_at?: string
          version?: number
          weighted_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "project_proposals_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_proposals_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "public_pro_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_proposals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_qanda: {
        Row: {
          answer: string | null
          answered_at: string | null
          asked_at: string
          asked_by: string
          id: string
          is_public: boolean
          project_id: string
          question: string
        }
        Insert: {
          answer?: string | null
          answered_at?: string | null
          asked_at?: string
          asked_by: string
          id?: string
          is_public?: boolean
          project_id: string
          question: string
        }
        Update: {
          answer?: string | null
          answered_at?: string | null
          asked_at?: string
          asked_by?: string
          id?: string
          is_public?: boolean
          project_id?: string
          question?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_qanda_asked_by_fkey"
            columns: ["asked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_qanda_asked_by_fkey"
            columns: ["asked_by"]
            isOneToOne: false
            referencedRelation: "public_pro_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_qanda_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_sign_offs: {
        Row: {
          created_at: string
          id: string
          project_id: string
          retention_released: boolean
          signed_at: string
          signed_off_by: string
          snag_notes: string | null
          stage: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          retention_released?: boolean
          signed_at?: string
          signed_off_by: string
          snag_notes?: string | null
          stage: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          retention_released?: boolean
          signed_at?: string
          signed_off_by?: string
          snag_notes?: string | null
          stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_sign_offs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_sign_offs_signed_off_by_fkey"
            columns: ["signed_off_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_sign_offs_signed_off_by_fkey"
            columns: ["signed_off_by"]
            isOneToOne: false
            referencedRelation: "public_pro_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      project_snags: {
        Row: {
          created_at: string
          description: string
          id: string
          project_id: string
          raised_by: string
          resolved_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          project_id: string
          raised_by: string
          resolved_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          project_id?: string
          raised_by?: string
          resolved_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_snags_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_snags_raised_by_fkey"
            columns: ["raised_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_snags_raised_by_fkey"
            columns: ["raised_by"]
            isOneToOne: false
            referencedRelation: "public_pro_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      project_updates: {
        Row: {
          content: string | null
          created_at: string
          id: string
          media_url: string | null
          posted_by: string
          project_id: string
          update_type: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          id?: string
          media_url?: string | null
          posted_by: string
          project_id: string
          update_type: string
        }
        Update: {
          content?: string | null
          created_at?: string
          id?: string
          media_url?: string | null
          posted_by?: string
          project_id?: string
          update_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_updates_posted_by_fkey"
            columns: ["posted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_updates_posted_by_fkey"
            columns: ["posted_by"]
            isOneToOne: false
            referencedRelation: "public_pro_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_updates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          account_type: string
          address_line_1: string | null
          address_line_2: string | null
          budget: number | null
          budget_revised: number | null
          budget_visible_to_contractors: boolean | null
          city: string | null
          created_at: string
          deposit_amount: number | null
          deposit_percentage: number | null
          deposit_required: boolean | null
          description: string | null
          id: string
          lead_contractor_id: string | null
          postcode: string | null
          posted_by: string
          proposal_deadline: string | null
          qanda_public: boolean | null
          retention_percentage: number | null
          scoring_criteria: Json | null
          tender_status: string
          title: string
          trade_categories: string[] | null
          updated_at: string
          visibility: string
        }
        Insert: {
          account_type?: string
          address_line_1?: string | null
          address_line_2?: string | null
          budget?: number | null
          budget_revised?: number | null
          budget_visible_to_contractors?: boolean | null
          city?: string | null
          created_at?: string
          deposit_amount?: number | null
          deposit_percentage?: number | null
          deposit_required?: boolean | null
          description?: string | null
          id?: string
          lead_contractor_id?: string | null
          postcode?: string | null
          posted_by: string
          proposal_deadline?: string | null
          qanda_public?: boolean | null
          retention_percentage?: number | null
          scoring_criteria?: Json | null
          tender_status?: string
          title: string
          trade_categories?: string[] | null
          updated_at?: string
          visibility?: string
        }
        Update: {
          account_type?: string
          address_line_1?: string | null
          address_line_2?: string | null
          budget?: number | null
          budget_revised?: number | null
          budget_visible_to_contractors?: boolean | null
          city?: string | null
          created_at?: string
          deposit_amount?: number | null
          deposit_percentage?: number | null
          deposit_required?: boolean | null
          description?: string | null
          id?: string
          lead_contractor_id?: string | null
          postcode?: string | null
          posted_by?: string
          proposal_deadline?: string | null
          qanda_public?: boolean | null
          retention_percentage?: number | null
          scoring_criteria?: Json | null
          tender_status?: string
          title?: string
          trade_categories?: string[] | null
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_customer_id_fkey"
            columns: ["posted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_customer_id_fkey"
            columns: ["posted_by"]
            isOneToOne: false
            referencedRelation: "public_pro_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_lead_contractor_id_fkey"
            columns: ["lead_contractor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_lead_contractor_id_fkey"
            columns: ["lead_contractor_id"]
            isOneToOne: false
            referencedRelation: "public_pro_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_attachments: {
        Row: {
          file_name: string
          file_url: string
          id: string
          proposal_id: string
          uploaded_at: string
        }
        Insert: {
          file_name: string
          file_url: string
          id?: string
          proposal_id: string
          uploaded_at?: string
        }
        Update: {
          file_name?: string
          file_url?: string
          id?: string
          proposal_id?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_attachments_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "project_proposals"
            referencedColumns: ["id"]
          },
        ]
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
          {
            foreignKeyName: "quote_form_templates_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "public_pro_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      quotes: {
        Row: {
          accepted_at: string | null
          additional_details: Json | null
          budget_range: string | null
          confirmed_at: string | null
          contact_revealed: boolean | null
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
          status_updated_at: string | null
          timeline: string | null
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          additional_details?: Json | null
          budget_range?: string | null
          confirmed_at?: string | null
          contact_revealed?: boolean | null
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
          status_updated_at?: string | null
          timeline?: string | null
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          additional_details?: Json | null
          budget_range?: string | null
          confirmed_at?: string | null
          contact_revealed?: boolean | null
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
          status_updated_at?: string | null
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
          {
            foreignKeyName: "quotes_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "public_pro_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          action_type: string
          created_at: string | null
          id: string
          identifier: string
        }
        Insert: {
          action_type: string
          created_at?: string | null
          id?: string
          identifier: string
        }
        Update: {
          action_type?: string
          created_at?: string | null
          id?: string
          identifier?: string
        }
        Relationships: []
      }
      schedule_events: {
        Row: {
          all_day: boolean
          batch_id: string | null
          client_name: string | null
          client_phone: string | null
          color: string | null
          contractor_id: string
          created_at: string
          cycle: number
          description: string | null
          end_time: string
          event_type: string
          id: string
          is_confirmed: boolean | null
          job_id: string | null
          location: string | null
          proposed_by: string | null
          quote_id: string | null
          start_time: string
          status: string
          title: string
          turn_kind: string
          updated_at: string
        }
        Insert: {
          all_day?: boolean
          batch_id?: string | null
          client_name?: string | null
          client_phone?: string | null
          color?: string | null
          contractor_id: string
          created_at?: string
          cycle?: number
          description?: string | null
          end_time: string
          event_type?: string
          id?: string
          is_confirmed?: boolean | null
          job_id?: string | null
          location?: string | null
          proposed_by?: string | null
          quote_id?: string | null
          start_time: string
          status?: string
          title: string
          turn_kind?: string
          updated_at?: string
        }
        Update: {
          all_day?: boolean
          batch_id?: string | null
          client_name?: string | null
          client_phone?: string | null
          color?: string | null
          contractor_id?: string
          created_at?: string
          cycle?: number
          description?: string | null
          end_time?: string
          event_type?: string
          id?: string
          is_confirmed?: boolean | null
          job_id?: string | null
          location?: string | null
          proposed_by?: string | null
          quote_id?: string | null
          start_time?: string
          status?: string
          title?: string
          turn_kind?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_events_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "issued_quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      service_contracts: {
        Row: {
          annual_value: number | null
          company_id: string
          contractor_id: string
          created_at: string | null
          description: string | null
          end_date: string
          id: string
          site_id: string | null
          start_date: string
          status: Database["public"]["Enums"]["service_contract_status"] | null
          title: string
          updated_at: string | null
        }
        Insert: {
          annual_value?: number | null
          company_id: string
          contractor_id: string
          created_at?: string | null
          description?: string | null
          end_date: string
          id?: string
          site_id?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["service_contract_status"] | null
          title: string
          updated_at?: string | null
        }
        Update: {
          annual_value?: number | null
          company_id?: string
          contractor_id?: string
          created_at?: string | null
          description?: string | null
          end_date?: string
          id?: string
          site_id?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["service_contract_status"] | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_contracts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_contracts_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_contracts_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "public_pro_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_contracts_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      service_documents: {
        Row: {
          created_at: string | null
          document_name: string
          document_type:
            | Database["public"]["Enums"]["service_document_type"]
            | null
          document_url: string
          id: string
          uploaded_by: string
          visit_id: string
        }
        Insert: {
          created_at?: string | null
          document_name: string
          document_type?:
            | Database["public"]["Enums"]["service_document_type"]
            | null
          document_url: string
          id?: string
          uploaded_by: string
          visit_id: string
        }
        Update: {
          created_at?: string | null
          document_name?: string
          document_type?:
            | Database["public"]["Enums"]["service_document_type"]
            | null
          document_url?: string
          id?: string
          uploaded_by?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "public_pro_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_documents_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "service_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      service_schedules: {
        Row: {
          asset_id: string
          contract_id: string
          created_at: string | null
          frequency: Database["public"]["Enums"]["service_frequency"]
          id: string
          is_active: boolean | null
          last_completed_at: string | null
          next_due_at: string
          notice_days: number | null
          updated_at: string | null
        }
        Insert: {
          asset_id: string
          contract_id: string
          created_at?: string | null
          frequency: Database["public"]["Enums"]["service_frequency"]
          id?: string
          is_active?: boolean | null
          last_completed_at?: string | null
          next_due_at: string
          notice_days?: number | null
          updated_at?: string | null
        }
        Update: {
          asset_id?: string
          contract_id?: string
          created_at?: string | null
          frequency?: Database["public"]["Enums"]["service_frequency"]
          id?: string
          is_active?: boolean | null
          last_completed_at?: string | null
          next_due_at?: string
          notice_days?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_schedules_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_schedules_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "service_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      service_visits: {
        Row: {
          asset_id: string
          company_id: string
          completed_at: string | null
          confirmed_date: string | null
          contractor_id: string
          created_at: string | null
          id: string
          notes: string | null
          schedule_id: string
          scheduled_window_end: string
          scheduled_window_start: string
          status: Database["public"]["Enums"]["service_visit_status"] | null
          updated_at: string | null
        }
        Insert: {
          asset_id: string
          company_id: string
          completed_at?: string | null
          confirmed_date?: string | null
          contractor_id: string
          created_at?: string | null
          id?: string
          notes?: string | null
          schedule_id: string
          scheduled_window_end: string
          scheduled_window_start: string
          status?: Database["public"]["Enums"]["service_visit_status"] | null
          updated_at?: string | null
        }
        Update: {
          asset_id?: string
          company_id?: string
          completed_at?: string | null
          confirmed_date?: string | null
          contractor_id?: string
          created_at?: string | null
          id?: string
          notes?: string | null
          schedule_id?: string
          scheduled_window_end?: string
          scheduled_window_start?: string
          status?: Database["public"]["Enums"]["service_visit_status"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_visits_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_visits_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_visits_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_visits_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "public_pro_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_visits_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "service_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      site_group_members: {
        Row: {
          group_id: string
          site_id: string
        }
        Insert: {
          group_id: string
          site_id: string
        }
        Update: {
          group_id?: string
          site_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "site_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_group_members_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      site_groups: {
        Row: {
          company_id: string
          created_at: string | null
          group_type: string
          id: string
          name: string
        }
        Insert: {
          company_id: string
          created_at?: string | null
          group_type: string
          id?: string
          name: string
        }
        Update: {
          company_id?: string
          created_at?: string | null
          group_type?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_groups_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      sites: {
        Row: {
          address: string
          address_line1: string | null
          address_line2: string | null
          city: string | null
          company_id: string
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          name: string
          notes: string | null
          postcode: string
          reference: string | null
          status: string
          ts_site_code: string
          updated_at: string | null
        }
        Insert: {
          address: string
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          company_id: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          notes?: string | null
          postcode: string
          reference?: string | null
          status?: string
          ts_site_code: string
          updated_at?: string | null
        }
        Update: {
          address?: string
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          notes?: string | null
          postcode?: string
          reference?: string | null
          status?: string
          ts_site_code?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sites_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_pro_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sla_breaches: {
        Row: {
          acknowledged: boolean | null
          acknowledged_at: string | null
          acknowledged_by: string | null
          breach_type: string | null
          breached_at: string
          company_id: string | null
          contractor_id: string | null
          created_at: string | null
          due_at: string
          id: string
          job_id: string | null
          minutes_overdue: number | null
          notes: string | null
          sla_rule_id: string | null
        }
        Insert: {
          acknowledged?: boolean | null
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          breach_type?: string | null
          breached_at: string
          company_id?: string | null
          contractor_id?: string | null
          created_at?: string | null
          due_at: string
          id?: string
          job_id?: string | null
          minutes_overdue?: number | null
          notes?: string | null
          sla_rule_id?: string | null
        }
        Update: {
          acknowledged?: boolean | null
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          breach_type?: string | null
          breached_at?: string
          company_id?: string | null
          contractor_id?: string | null
          created_at?: string | null
          due_at?: string
          id?: string
          job_id?: string | null
          minutes_overdue?: number | null
          notes?: string | null
          sla_rule_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sla_breaches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sla_breaches_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sla_breaches_sla_rule_id_fkey"
            columns: ["sla_rule_id"]
            isOneToOne: false
            referencedRelation: "sla_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      sla_clock_events: {
        Row: {
          actor_id: string | null
          clock_target: string
          event_type: string
          id: string
          job_id: string
          occurred_at: string
          reason: string | null
          sla_rule_id: string | null
        }
        Insert: {
          actor_id?: string | null
          clock_target: string
          event_type: string
          id?: string
          job_id: string
          occurred_at?: string
          reason?: string | null
          sla_rule_id?: string | null
        }
        Update: {
          actor_id?: string | null
          clock_target?: string
          event_type?: string
          id?: string
          job_id?: string
          occurred_at?: string
          reason?: string | null
          sla_rule_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sla_clock_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sla_clock_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "public_pro_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sla_clock_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sla_clock_events_sla_rule_id_fkey"
            columns: ["sla_rule_id"]
            isOneToOne: false
            referencedRelation: "sla_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      sla_rules: {
        Row: {
          alert_pct: number
          applies_to_trade: string | null
          attendance_hours: number | null
          business_hours_end: string | null
          business_hours_only: boolean
          business_hours_start: string | null
          clock_pausable: boolean
          company_id: string | null
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          priority: string
          resolution_hours: number
          response_hours: number
          updated_at: string | null
        }
        Insert: {
          alert_pct?: number
          applies_to_trade?: string | null
          attendance_hours?: number | null
          business_hours_end?: string | null
          business_hours_only?: boolean
          business_hours_start?: string | null
          clock_pausable?: boolean
          company_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          priority: string
          resolution_hours: number
          response_hours: number
          updated_at?: string | null
        }
        Update: {
          alert_pct?: number
          applies_to_trade?: string | null
          attendance_hours?: number | null
          business_hours_end?: string | null
          business_hours_only?: boolean
          business_hours_start?: string | null
          clock_pausable?: boolean
          company_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          priority?: string
          resolution_hours?: number
          response_hours?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sla_rules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      subcontracts: {
        Row: {
          contract_id: string
          contractor_id: string
          created_at: string
          end_date: string | null
          id: string
          scope_description: string
          start_date: string
          status: string
          subcontract_value: number
          subcontractor_id: string
          updated_at: string
        }
        Insert: {
          contract_id: string
          contractor_id: string
          created_at?: string
          end_date?: string | null
          id?: string
          scope_description: string
          start_date: string
          status?: string
          subcontract_value: number
          subcontractor_id: string
          updated_at?: string
        }
        Update: {
          contract_id?: string
          contractor_id?: string
          created_at?: string
          end_date?: string | null
          id?: string
          scope_description?: string
          start_date?: string
          status?: string
          subcontract_value?: number
          subcontractor_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subcontracts_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
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
          profile_id: string | null
          role: string
          status: string | null
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
          profile_id?: string | null
          role: string
          status?: string | null
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
          profile_id?: string | null
          role?: string
          status?: string | null
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
          {
            foreignKeyName: "team_members_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "public_pro_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "team_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "public_pro_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tender_addenda: {
        Row: {
          created_at: string
          detail: string | null
          id: string
          issued_by: string
          new_deadline: string | null
          sequence: number
          summary: string
          tender_id: string
        }
        Insert: {
          created_at?: string
          detail?: string | null
          id?: string
          issued_by: string
          new_deadline?: string | null
          sequence: number
          summary: string
          tender_id: string
        }
        Update: {
          created_at?: string
          detail?: string | null
          id?: string
          issued_by?: string
          new_deadline?: string | null
          sequence?: number
          summary?: string
          tender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tender_addenda_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tender_addenda_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "public_pro_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tender_addenda_tender_id_fkey"
            columns: ["tender_id"]
            isOneToOne: false
            referencedRelation: "tenders"
            referencedColumns: ["id"]
          },
        ]
      }
      tender_application_references: {
        Row: {
          application_id: string
          client_name: string
          contact: Json | null
          id: string
          project_summary: string | null
        }
        Insert: {
          application_id: string
          client_name: string
          contact?: Json | null
          id?: string
          project_summary?: string | null
        }
        Update: {
          application_id?: string
          client_name?: string
          contact?: Json | null
          id?: string
          project_summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tender_application_references_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "tender_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      tender_applications: {
        Row: {
          addendum_ack_sequence: number | null
          application_number: string
          contractor_id: string
          cover_note: string | null
          created_at: string
          declarations: Json | null
          id: string
          lump_sum_total: number | null
          methodology: string | null
          prequal_snapshot: Json | null
          programme_detail: string | null
          status: string
          subcontracting: Json | null
          submitted_at: string | null
          tender_id: string
          updated_at: string
          withdrawn_at: string | null
        }
        Insert: {
          addendum_ack_sequence?: number | null
          application_number: string
          contractor_id: string
          cover_note?: string | null
          created_at?: string
          declarations?: Json | null
          id?: string
          lump_sum_total?: number | null
          methodology?: string | null
          prequal_snapshot?: Json | null
          programme_detail?: string | null
          status?: string
          subcontracting?: Json | null
          submitted_at?: string | null
          tender_id: string
          updated_at?: string
          withdrawn_at?: string | null
        }
        Update: {
          addendum_ack_sequence?: number | null
          application_number?: string
          contractor_id?: string
          cover_note?: string | null
          created_at?: string
          declarations?: Json | null
          id?: string
          lump_sum_total?: number | null
          methodology?: string | null
          prequal_snapshot?: Json | null
          programme_detail?: string | null
          status?: string
          subcontracting?: Json | null
          submitted_at?: string | null
          tender_id?: string
          updated_at?: string
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tender_applications_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tender_applications_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "public_pro_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tender_applications_tender_id_fkey"
            columns: ["tender_id"]
            isOneToOne: false
            referencedRelation: "tenders"
            referencedColumns: ["id"]
          },
        ]
      }
      tender_clarifications: {
        Row: {
          answer: string | null
          answered_at: string | null
          answered_by: string | null
          asked_by: string
          created_at: string
          id: string
          question: string
          tender_id: string
        }
        Insert: {
          answer?: string | null
          answered_at?: string | null
          answered_by?: string | null
          asked_by: string
          created_at?: string
          id?: string
          question: string
          tender_id: string
        }
        Update: {
          answer?: string | null
          answered_at?: string | null
          answered_by?: string | null
          asked_by?: string
          created_at?: string
          id?: string
          question?: string
          tender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tender_clarifications_answered_by_fkey"
            columns: ["answered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tender_clarifications_answered_by_fkey"
            columns: ["answered_by"]
            isOneToOne: false
            referencedRelation: "public_pro_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tender_clarifications_asked_by_fkey"
            columns: ["asked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tender_clarifications_asked_by_fkey"
            columns: ["asked_by"]
            isOneToOne: false
            referencedRelation: "public_pro_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tender_clarifications_tender_id_fkey"
            columns: ["tender_id"]
            isOneToOne: false
            referencedRelation: "tenders"
            referencedColumns: ["id"]
          },
        ]
      }
      tender_documents: {
        Row: {
          addendum_id: string | null
          created_at: string
          file_path: string
          id: string
          label: string | null
          tender_id: string
          uploaded_by: string
        }
        Insert: {
          addendum_id?: string | null
          created_at?: string
          file_path: string
          id?: string
          label?: string | null
          tender_id: string
          uploaded_by: string
        }
        Update: {
          addendum_id?: string | null
          created_at?: string
          file_path?: string
          id?: string
          label?: string | null
          tender_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "tender_documents_addendum_id_fkey"
            columns: ["addendum_id"]
            isOneToOne: false
            referencedRelation: "tender_addenda"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tender_documents_tender_id_fkey"
            columns: ["tender_id"]
            isOneToOne: false
            referencedRelation: "tenders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tender_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tender_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "public_pro_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tender_evaluation_criteria: {
        Row: {
          id: string
          label: string
          tender_id: string
          weight: number | null
        }
        Insert: {
          id?: string
          label: string
          tender_id: string
          weight?: number | null
        }
        Update: {
          id?: string
          label?: string
          tender_id?: string
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tender_evaluation_criteria_tender_id_fkey"
            columns: ["tender_id"]
            isOneToOne: false
            referencedRelation: "tenders"
            referencedColumns: ["id"]
          },
        ]
      }
      tender_invitations: {
        Row: {
          contractor_id: string
          created_at: string
          declined_reason: string | null
          id: string
          invited_by: string
          is_incumbent: boolean
          responded_at: string | null
          status: string
          tender_id: string
          viewed_at: string | null
        }
        Insert: {
          contractor_id: string
          created_at?: string
          declined_reason?: string | null
          id?: string
          invited_by: string
          is_incumbent?: boolean
          responded_at?: string | null
          status?: string
          tender_id: string
          viewed_at?: string | null
        }
        Update: {
          contractor_id?: string
          created_at?: string
          declined_reason?: string | null
          id?: string
          invited_by?: string
          is_incumbent?: boolean
          responded_at?: string | null
          status?: string
          tender_id?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tender_invitations_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tender_invitations_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "public_pro_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tender_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tender_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "public_pro_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tender_invitations_tender_id_fkey"
            columns: ["tender_id"]
            isOneToOne: false
            referencedRelation: "tenders"
            referencedColumns: ["id"]
          },
        ]
      }
      tender_prequal_requirements: {
        Row: {
          detail: Json | null
          id: string
          kind: string
          mandatory: boolean
          tender_id: string
        }
        Insert: {
          detail?: Json | null
          id?: string
          kind: string
          mandatory: boolean
          tender_id: string
        }
        Update: {
          detail?: Json | null
          id?: string
          kind?: string
          mandatory?: boolean
          tender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tender_prequal_requirements_tender_id_fkey"
            columns: ["tender_id"]
            isOneToOne: false
            referencedRelation: "tenders"
            referencedColumns: ["id"]
          },
        ]
      }
      tender_rates_cards: {
        Row: {
          application_id: string
          callout_out_of_hours: number
          callout_standard: number
          extra_lines: Json | null
          hourly_rate: number
          id: string
          materials_markup_pct: number
          minimum_charge: number | null
        }
        Insert: {
          application_id: string
          callout_out_of_hours: number
          callout_standard: number
          extra_lines?: Json | null
          hourly_rate: number
          id?: string
          materials_markup_pct: number
          minimum_charge?: number | null
        }
        Update: {
          application_id?: string
          callout_out_of_hours?: number
          callout_standard?: number
          extra_lines?: Json | null
          hourly_rate?: number
          id?: string
          materials_markup_pct?: number
          minimum_charge?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tender_rates_cards_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "tender_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      tender_response_requirements: {
        Row: {
          config: Json | null
          id: string
          kind: string
          tender_id: string
        }
        Insert: {
          config?: Json | null
          id?: string
          kind: string
          tender_id: string
        }
        Update: {
          config?: Json | null
          id?: string
          kind?: string
          tender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tender_response_requirements_tender_id_fkey"
            columns: ["tender_id"]
            isOneToOne: false
            referencedRelation: "tenders"
            referencedColumns: ["id"]
          },
        ]
      }
      tender_sites: {
        Row: {
          id: string
          site_id: string
          tender_id: string
        }
        Insert: {
          id?: string
          site_id: string
          tender_id: string
        }
        Update: {
          id?: string
          site_id?: string
          tender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tender_sites_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tender_sites_tender_id_fkey"
            columns: ["tender_id"]
            isOneToOne: false
            referencedRelation: "tenders"
            referencedColumns: ["id"]
          },
        ]
      }
      tenders: {
        Row: {
          awarded_at: string | null
          bid_validity_days: number
          bid_visibility: string
          budget_max: number | null
          budget_min: number | null
          budget_visible: boolean
          cancelled_reason: string | null
          closed_at: string | null
          company_id: string
          contract_start_date: string | null
          contract_term_months: number | null
          created_at: string
          created_by: string
          distribution: string
          formal_procurement: boolean
          id: string
          project_id: string | null
          published_at: string | null
          response_deadline: string | null
          scope_description: string | null
          site_visit_required: boolean
          status: string
          tender_number: string
          tender_type: string
          title: string
          trade_categories: string[]
          tupe_applies: boolean | null
          updated_at: string
        }
        Insert: {
          awarded_at?: string | null
          bid_validity_days?: number
          bid_visibility?: string
          budget_max?: number | null
          budget_min?: number | null
          budget_visible?: boolean
          cancelled_reason?: string | null
          closed_at?: string | null
          company_id: string
          contract_start_date?: string | null
          contract_term_months?: number | null
          created_at?: string
          created_by: string
          distribution?: string
          formal_procurement?: boolean
          id?: string
          project_id?: string | null
          published_at?: string | null
          response_deadline?: string | null
          scope_description?: string | null
          site_visit_required?: boolean
          status?: string
          tender_number: string
          tender_type: string
          title: string
          trade_categories: string[]
          tupe_applies?: boolean | null
          updated_at?: string
        }
        Update: {
          awarded_at?: string | null
          bid_validity_days?: number
          bid_visibility?: string
          budget_max?: number | null
          budget_min?: number | null
          budget_visible?: boolean
          cancelled_reason?: string | null
          closed_at?: string | null
          company_id?: string
          contract_start_date?: string | null
          contract_term_months?: number | null
          created_at?: string
          created_by?: string
          distribution?: string
          formal_procurement?: boolean
          id?: string
          project_id?: string | null
          published_at?: string | null
          response_deadline?: string | null
          scope_description?: string | null
          site_visit_required?: boolean
          status?: string
          tender_number?: string
          tender_type?: string
          title?: string
          trade_categories?: string[]
          tupe_applies?: boolean | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_pro_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      timesheets: {
        Row: {
          arrived_at: string | null
          contractor_id: string
          created_at: string
          date: string
          description: string | null
          hours: number
          id: string
          job_id: string | null
          left_at: string | null
          project_name: string | null
          status: string
          updated_at: string
          worker_id: string | null
        }
        Insert: {
          arrived_at?: string | null
          contractor_id: string
          created_at?: string
          date: string
          description?: string | null
          hours: number
          id?: string
          job_id?: string | null
          left_at?: string | null
          project_name?: string | null
          status?: string
          updated_at?: string
          worker_id?: string | null
        }
        Update: {
          arrived_at?: string | null
          contractor_id?: string
          created_at?: string
          date?: string
          description?: string | null
          hours?: number
          id?: string
          job_id?: string | null
          left_at?: string | null
          project_name?: string | null
          status?: string
          updated_at?: string
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "timesheets_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timesheets_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "public_pro_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timesheets_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timesheets_team_member_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      user_seen_announcements: {
        Row: {
          announcement_id: string
          seen_at: string
          user_id: string
        }
        Insert: {
          announcement_id: string
          seen_at?: string
          user_id: string
        }
        Update: {
          announcement_id?: string
          seen_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_seen_announcements_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "feature_announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_seen_announcements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_seen_announcements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_pro_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      public_pro_profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          company_name: string | null
          completed_jobs: number | null
          cover_url: string | null
          created_at: string | null
          cta_label: string | null
          full_name: string | null
          hourly_rate: number | null
          id: string | null
          is_active: boolean | null
          is_available: boolean | null
          is_verified: boolean | null
          location: string | null
          logo_url: string | null
          profile_is_published: boolean | null
          rating: number | null
          review_count: number | null
          trades: string[] | null
          ts_profile_code: string | null
          updated_at: string | null
          user_id: string | null
          user_type: Database["public"]["Enums"]["user_type"] | null
          working_radius: string | null
          years_experience: number | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          company_name?: string | null
          completed_jobs?: number | null
          cover_url?: string | null
          created_at?: string | null
          cta_label?: string | null
          full_name?: string | null
          hourly_rate?: number | null
          id?: string | null
          is_active?: boolean | null
          is_available?: boolean | null
          is_verified?: boolean | null
          location?: string | null
          logo_url?: string | null
          profile_is_published?: boolean | null
          rating?: number | null
          review_count?: number | null
          trades?: string[] | null
          ts_profile_code?: string | null
          updated_at?: string | null
          user_id?: string | null
          user_type?: Database["public"]["Enums"]["user_type"] | null
          working_radius?: string | null
          years_experience?: number | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          company_name?: string | null
          completed_jobs?: number | null
          cover_url?: string | null
          created_at?: string | null
          cta_label?: string | null
          full_name?: string | null
          hourly_rate?: number | null
          id?: string | null
          is_active?: boolean | null
          is_available?: boolean | null
          is_verified?: boolean | null
          location?: string | null
          logo_url?: string | null
          profile_is_published?: boolean | null
          rating?: number | null
          review_count?: number | null
          trades?: string[] | null
          ts_profile_code?: string | null
          updated_at?: string | null
          user_id?: string | null
          user_type?: Database["public"]["Enums"]["user_type"] | null
          working_radius?: string | null
          years_experience?: number | null
        }
        Relationships: []
      }
      tender_clarifications_for_contractor: {
        Row: {
          answer: string | null
          answered_at: string | null
          answered_by: string | null
          asked_by: string | null
          created_at: string | null
          id: string | null
          question: string | null
          tender_id: string | null
        }
        Insert: {
          answer?: string | null
          answered_at?: string | null
          answered_by?: string | null
          asked_by?: never
          created_at?: string | null
          id?: string | null
          question?: string | null
          tender_id?: string | null
        }
        Update: {
          answer?: string | null
          answered_at?: string | null
          answered_by?: string | null
          asked_by?: never
          created_at?: string | null
          id?: string | null
          question?: string | null
          tender_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tender_clarifications_answered_by_fkey"
            columns: ["answered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tender_clarifications_answered_by_fkey"
            columns: ["answered_by"]
            isOneToOne: false
            referencedRelation: "public_pro_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tender_clarifications_tender_id_fkey"
            columns: ["tender_id"]
            isOneToOne: false
            referencedRelation: "tenders"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_business_invite: {
        Args: { p_invite_id?: string; p_token?: string }
        Returns: string
      }
      anonymise_user: { Args: { target_user_id: string }; Returns: undefined }
      application_is_draft: {
        Args: { p_application_id: string }
        Returns: boolean
      }
      auth_user_company_ids: { Args: never; Returns: string[] }
      build_prequal_snapshot: {
        Args: { p_company_id: string; p_contractor_id: string }
        Returns: Json
      }
      business_can_view_application: {
        Args: { p_application_id: string }
        Returns: boolean
      }
      can_access_site: { Args: { p_site_id: string }; Returns: boolean }
      check_sla_breaches: { Args: never; Returns: undefined }
      contractor_can_view_tender: {
        Args: { p_tender_id: string }
        Returns: boolean
      }
      create_tender_application_draft: {
        Args: { p_tender_id: string }
        Returns: string
      }
      generate_site_ts_code: { Args: { p_company_id: string }; Returns: string }
      generate_ts_code: { Args: { user_type_val: string }; Returns: string }
      generate_ts_profile_code:
        | { Args: never; Returns: string }
        | { Args: { p_user_type?: string }; Returns: string }
      is_company_member: { Args: { p_company_id: string }; Returns: boolean }
      is_company_owner: { Args: { p_company_id: string }; Returns: boolean }
      is_conversation_party: {
        Args: { p_conversation_id: string }
        Returns: boolean
      }
      is_platform_admin: { Args: never; Returns: boolean }
      next_business_document_number: {
        Args: { p_company_id: string; p_entity: string }
        Returns: number
      }
      next_document_number: {
        Args: { p_contractor_id: string; p_entity: string }
        Returns: number
      }
      release_schedule_block: {
        Args: { p_event_id: string }
        Returns: undefined
      }
      submit_tender_application: {
        Args: { p_application_id: string }
        Returns: undefined
      }
      tender_application_received_count: {
        Args: { p_tender_id: string }
        Returns: number
      }
      tender_company_id: { Args: { p_tender_id: string }; Returns: string }
      tender_id_from_storage_path: { Args: { p_name: string }; Returns: string }
    }
    Enums: {
      asset_category:
        | "fire_safety"
        | "emergency_lighting"
        | "fire_suppression"
        | "fire_doors"
        | "smoke_ventilation"
        | "electrical"
        | "lightning_protection"
        | "ups_systems"
        | "solar_panels"
        | "ev_charging"
        | "hvac"
        | "boilers"
        | "air_handling"
        | "ventilation"
        | "heat_pumps"
        | "chiller_systems"
        | "plumbing"
        | "water_hygiene"
        | "water_treatment"
        | "drainage"
        | "rainwater_harvesting"
        | "gas"
        | "gas_detection"
        | "security"
        | "access_control"
        | "cctv"
        | "intruder_alarms"
        | "intercoms"
        | "lifts_lifting"
        | "escalators"
        | "loading_bays"
        | "roofing"
        | "glazing"
        | "doors_windows"
        | "cladding"
        | "structural"
        | "grounds"
        | "car_parks"
        | "drainage_external"
        | "pest_control"
        | "asbestos"
        | "legionella"
        | "air_quality"
        | "waste_management"
        | "other"
      service_contract_status: "draft" | "active" | "expired" | "cancelled"
      service_document_type:
        | "certificate"
        | "report"
        | "invoice"
        | "photo"
        | "other"
      service_frequency:
        | "weekly"
        | "bi_weekly"
        | "monthly"
        | "bi_monthly"
        | "quarterly"
        | "six_monthly"
        | "annual"
        | "2_yearly"
        | "3_yearly"
        | "4_yearly"
        | "5_yearly"
        | "6_yearly"
        | "7_yearly"
        | "8_yearly"
        | "9_yearly"
        | "10_yearly"
      service_visit_status:
        | "scheduled"
        | "confirmed"
        | "completed"
        | "overdue"
        | "cancelled"
      user_type: "personal" | "business" | "contractor"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      asset_category: [
        "fire_safety",
        "emergency_lighting",
        "fire_suppression",
        "fire_doors",
        "smoke_ventilation",
        "electrical",
        "lightning_protection",
        "ups_systems",
        "solar_panels",
        "ev_charging",
        "hvac",
        "boilers",
        "air_handling",
        "ventilation",
        "heat_pumps",
        "chiller_systems",
        "plumbing",
        "water_hygiene",
        "water_treatment",
        "drainage",
        "rainwater_harvesting",
        "gas",
        "gas_detection",
        "security",
        "access_control",
        "cctv",
        "intruder_alarms",
        "intercoms",
        "lifts_lifting",
        "escalators",
        "loading_bays",
        "roofing",
        "glazing",
        "doors_windows",
        "cladding",
        "structural",
        "grounds",
        "car_parks",
        "drainage_external",
        "pest_control",
        "asbestos",
        "legionella",
        "air_quality",
        "waste_management",
        "other",
      ],
      service_contract_status: ["draft", "active", "expired", "cancelled"],
      service_document_type: [
        "certificate",
        "report",
        "invoice",
        "photo",
        "other",
      ],
      service_frequency: [
        "weekly",
        "bi_weekly",
        "monthly",
        "bi_monthly",
        "quarterly",
        "six_monthly",
        "annual",
        "2_yearly",
        "3_yearly",
        "4_yearly",
        "5_yearly",
        "6_yearly",
        "7_yearly",
        "8_yearly",
        "9_yearly",
        "10_yearly",
      ],
      service_visit_status: [
        "scheduled",
        "confirmed",
        "completed",
        "overdue",
        "cancelled",
      ],
      user_type: ["personal", "business", "contractor"],
    },
  },
} as const
