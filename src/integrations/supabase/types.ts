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
      companies: {
        Row: {
          address: string | null
          city: string | null
          company_size: string | null
          created_at: string | null
          email: string | null
          id: string
          industry: string | null
          logo_url: string | null
          name: string
          owner_id: string | null
          phone: string | null
          postcode: string | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          company_size?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          industry?: string | null
          logo_url?: string | null
          name: string
          owner_id?: string | null
          phone?: string | null
          postcode?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          company_size?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          industry?: string | null
          logo_url?: string | null
          name?: string
          owner_id?: string | null
          phone?: string | null
          postcode?: string | null
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
          company_id: string | null
          contractor_id: string | null
          created_at: string | null
          id: string
          notes: string | null
          status: string | null
          tier: string | null
          updated_at: string | null
        }
        Insert: {
          added_by?: string | null
          approved_at?: string | null
          company_id?: string | null
          contractor_id?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          status?: string | null
          tier?: string | null
          updated_at?: string | null
        }
        Update: {
          added_by?: string | null
          approved_at?: string | null
          company_id?: string | null
          contractor_id?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
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
        ]
      }
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
          {
            foreignKeyName: "contractor_photos_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "public_pro_profiles"
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
          {
            foreignKeyName: "contracts_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "public_pro_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      conversations: {
        Row: {
          contract_id: string | null
          created_at: string
          id: string
          initiator_id: string
          initiator_type: string
          is_archived_initiator: boolean
          is_archived_recipient: boolean
          issued_quote_id: string | null
          last_message_at: string | null
          quote_id: string | null
          recipient_id: string
          subject: string
          updated_at: string
        }
        Insert: {
          contract_id?: string | null
          created_at?: string
          id?: string
          initiator_id: string
          initiator_type: string
          is_archived_initiator?: boolean
          is_archived_recipient?: boolean
          issued_quote_id?: string | null
          last_message_at?: string | null
          quote_id?: string | null
          recipient_id: string
          subject: string
          updated_at?: string
        }
        Update: {
          contract_id?: string | null
          created_at?: string
          id?: string
          initiator_id?: string
          initiator_type?: string
          is_archived_initiator?: boolean
          is_archived_recipient?: boolean
          issued_quote_id?: string | null
          last_message_at?: string | null
          quote_id?: string | null
          recipient_id?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_issued_quote_id_fkey"
            columns: ["issued_quote_id"]
            isOneToOne: false
            referencedRelation: "issued_quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
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
          source?: string | null
          status?: string
          total_revenue?: number
          updated_at?: string
        }
        Relationships: []
      }
      enquiries: {
        Row: {
          additional_details: string | null
          budget_range: string | null
          contractor_id: string | null
          created_at: string | null
          customer_email: string | null
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          customer_ts_code: string | null
          id: string
          job_description: string
          location: string
          photo_urls: string[] | null
          preferred_timeline: string | null
          project_id: string | null
          status: string | null
          title: string | null
          trade: string | null
          updated_at: string | null
        }
        Insert: {
          additional_details?: string | null
          budget_range?: string | null
          contractor_id?: string | null
          created_at?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          customer_ts_code?: string | null
          id?: string
          job_description: string
          location: string
          photo_urls?: string[] | null
          preferred_timeline?: string | null
          project_id?: string | null
          status?: string | null
          title?: string | null
          trade?: string | null
          updated_at?: string | null
        }
        Update: {
          additional_details?: string | null
          budget_range?: string | null
          contractor_id?: string | null
          created_at?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          customer_ts_code?: string | null
          id?: string
          job_description?: string
          location?: string
          photo_urls?: string[] | null
          preferred_timeline?: string | null
          project_id?: string | null
          status?: string | null
          title?: string | null
          trade?: string | null
          updated_at?: string | null
        }
        Relationships: [
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
          invoice_number: string | null
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
          invoice_number?: string | null
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
          invoice_number?: string | null
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
          id: string
          items: Json
          notes: string | null
          parent_quote_id: string | null
          project_id: string | null
          quote_number: string | null
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
          version: number | null
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
          id?: string
          items?: Json
          notes?: string | null
          parent_quote_id?: string | null
          project_id?: string | null
          quote_number?: string | null
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
          version?: number | null
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
          id?: string
          items?: Json
          notes?: string | null
          parent_quote_id?: string | null
          project_id?: string | null
          quote_number?: string | null
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
          version?: number | null
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
          created_at: string
          description: string | null
          id: string
          job_id: string
          photo_url: string
          title: string | null
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          job_id: string
          photo_url: string
          title?: string | null
          uploaded_by: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          job_id?: string
          photo_url?: string
          title?: string | null
          uploaded_by?: string
        }
        Relationships: [
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
          company_id: string | null
          completed_at: string | null
          contract_value: number | null
          contractor_id: string
          created_at: string
          customer_id: string
          description: string | null
          end_date: string | null
          id: string
          issued_quote_id: string | null
          job_number: string | null
          location: string | null
          portfolio_approved: boolean | null
          priority: string | null
          project_id: string | null
          responded_at: string | null
          signed_off_at: string | null
          signed_off_by: string | null
          sla_resolution_due: string | null
          sla_response_due: string | null
          sla_rule_id: string | null
          start_date: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          actual_end?: string | null
          actual_start?: string | null
          company_id?: string | null
          completed_at?: string | null
          contract_value?: number | null
          contractor_id: string
          created_at?: string
          customer_id: string
          description?: string | null
          end_date?: string | null
          id?: string
          issued_quote_id?: string | null
          job_number?: string | null
          location?: string | null
          portfolio_approved?: boolean | null
          priority?: string | null
          project_id?: string | null
          responded_at?: string | null
          signed_off_at?: string | null
          signed_off_by?: string | null
          sla_resolution_due?: string | null
          sla_response_due?: string | null
          sla_rule_id?: string | null
          start_date?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          actual_end?: string | null
          actual_start?: string | null
          company_id?: string | null
          completed_at?: string | null
          contract_value?: number | null
          contractor_id?: string
          created_at?: string
          customer_id?: string
          description?: string | null
          end_date?: string | null
          id?: string
          issued_quote_id?: string | null
          job_number?: string | null
          location?: string | null
          portfolio_approved?: boolean | null
          priority?: string | null
          project_id?: string | null
          responded_at?: string | null
          signed_off_at?: string | null
          signed_off_by?: string | null
          sla_resolution_due?: string | null
          sla_response_due?: string | null
          sla_rule_id?: string | null
          start_date?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
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
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          read_at: string | null
          sender_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          read_at?: string | null
          sender_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          read_at?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
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
      profiles: {
        Row: {
          address: string | null
          avatar_url: string | null
          bio: string | null
          company_name: string | null
          completed_jobs: number | null
          created_at: string
          email: string | null
          full_name: string | null
          hourly_rate: number | null
          id: string
          is_available: boolean | null
          is_verified: boolean | null
          location: string | null
          logo_url: string | null
          onboarding_completed: boolean | null
          phone: string | null
          rating: number | null
          review_count: number | null
          stripe_account_id: string | null
          trades: string[] | null
          ts_profile_code: string | null
          updated_at: string
          user_id: string
          user_type: Database["public"]["Enums"]["user_type"]
          website: string | null
          working_radius: string | null
          years_experience: number | null
        }
        Insert: {
          address?: string | null
          avatar_url?: string | null
          bio?: string | null
          company_name?: string | null
          completed_jobs?: number | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          hourly_rate?: number | null
          id?: string
          is_available?: boolean | null
          is_verified?: boolean | null
          location?: string | null
          logo_url?: string | null
          onboarding_completed?: boolean | null
          phone?: string | null
          rating?: number | null
          review_count?: number | null
          stripe_account_id?: string | null
          trades?: string[] | null
          ts_profile_code?: string | null
          updated_at?: string
          user_id: string
          user_type?: Database["public"]["Enums"]["user_type"]
          website?: string | null
          working_radius?: string | null
          years_experience?: number | null
        }
        Update: {
          address?: string | null
          avatar_url?: string | null
          bio?: string | null
          company_name?: string | null
          completed_jobs?: number | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          hourly_rate?: number | null
          id?: string
          is_available?: boolean | null
          is_verified?: boolean | null
          location?: string | null
          logo_url?: string | null
          onboarding_completed?: boolean | null
          phone?: string | null
          rating?: number | null
          review_count?: number | null
          stripe_account_id?: string | null
          trades?: string[] | null
          ts_profile_code?: string | null
          updated_at?: string
          user_id?: string
          user_type?: Database["public"]["Enums"]["user_type"]
          website?: string | null
          working_radius?: string | null
          years_experience?: number | null
        }
        Relationships: []
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
      projects: {
        Row: {
          address_line_1: string | null
          address_line_2: string | null
          city: string | null
          created_at: string
          customer_id: string
          description: string | null
          id: string
          postcode: string | null
          status: string
          title: string
          trade_category: string | null
          updated_at: string
        }
        Insert: {
          address_line_1?: string | null
          address_line_2?: string | null
          city?: string | null
          created_at?: string
          customer_id: string
          description?: string | null
          id?: string
          postcode?: string | null
          status?: string
          title: string
          trade_category?: string | null
          updated_at?: string
        }
        Update: {
          address_line_1?: string | null
          address_line_2?: string | null
          city?: string | null
          created_at?: string
          customer_id?: string
          description?: string | null
          id?: string
          postcode?: string | null
          status?: string
          title?: string
          trade_category?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "public_pro_profiles"
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
          client_name: string | null
          client_phone: string | null
          color: string | null
          contractor_id: string
          created_at: string
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
          updated_at: string
        }
        Insert: {
          all_day?: boolean
          client_name?: string | null
          client_phone?: string | null
          color?: string | null
          contractor_id: string
          created_at?: string
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
          updated_at?: string
        }
        Update: {
          all_day?: boolean
          client_name?: string | null
          client_phone?: string | null
          color?: string | null
          contractor_id?: string
          created_at?: string
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
      sla_rules: {
        Row: {
          applies_to_trade: string | null
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
          applies_to_trade?: string | null
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
          applies_to_trade?: string | null
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
      tender_responses: {
        Row: {
          contractor_id: string | null
          cover_note: string | null
          created_at: string | null
          documents_url: string[] | null
          id: string
          proposed_end_date: string | null
          proposed_price: number | null
          proposed_start_date: string | null
          status: string | null
          submitted_at: string | null
          tender_id: string | null
          updated_at: string | null
        }
        Insert: {
          contractor_id?: string | null
          cover_note?: string | null
          created_at?: string | null
          documents_url?: string[] | null
          id?: string
          proposed_end_date?: string | null
          proposed_price?: number | null
          proposed_start_date?: string | null
          status?: string | null
          submitted_at?: string | null
          tender_id?: string | null
          updated_at?: string | null
        }
        Update: {
          contractor_id?: string | null
          cover_note?: string | null
          created_at?: string | null
          documents_url?: string[] | null
          id?: string
          proposed_end_date?: string | null
          proposed_price?: number | null
          proposed_start_date?: string | null
          status?: string | null
          submitted_at?: string | null
          tender_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tender_responses_tender_id_fkey"
            columns: ["tender_id"]
            isOneToOne: false
            referencedRelation: "tenders"
            referencedColumns: ["id"]
          },
        ]
      }
      tenders: {
        Row: {
          budget_max: number | null
          budget_min: number | null
          company_id: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          documents_url: string[] | null
          end_date: string | null
          id: string
          invite_only: boolean | null
          location: string | null
          postcode: string | null
          start_date: string | null
          status: string | null
          submission_deadline: string | null
          title: string
          trade_category: string | null
          updated_at: string | null
        }
        Insert: {
          budget_max?: number | null
          budget_min?: number | null
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          documents_url?: string[] | null
          end_date?: string | null
          id?: string
          invite_only?: boolean | null
          location?: string | null
          postcode?: string | null
          start_date?: string | null
          status?: string | null
          submission_deadline?: string | null
          title: string
          trade_category?: string | null
          updated_at?: string | null
        }
        Update: {
          budget_max?: number | null
          budget_min?: number | null
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          documents_url?: string[] | null
          end_date?: string | null
          id?: string
          invite_only?: boolean | null
          location?: string | null
          postcode?: string | null
          start_date?: string | null
          status?: string | null
          submission_deadline?: string | null
          title?: string
          trade_category?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
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
            foreignKeyName: "timesheets_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "public_pro_profiles"
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
      public_pro_profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          company_name: string | null
          created_at: string | null
          full_name: string | null
          hourly_rate: number | null
          id: string | null
          is_available: boolean | null
          is_verified: boolean | null
          location: string | null
          logo_url: string | null
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
          created_at?: string | null
          full_name?: string | null
          hourly_rate?: number | null
          id?: string | null
          is_available?: boolean | null
          is_verified?: boolean | null
          location?: string | null
          logo_url?: string | null
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
          created_at?: string | null
          full_name?: string | null
          hourly_rate?: number | null
          id?: string | null
          is_available?: boolean | null
          is_verified?: boolean | null
          location?: string | null
          logo_url?: string | null
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
    }
    Functions: {
      anonymise_user: { Args: { target_user_id: string }; Returns: undefined }
      check_sla_breaches: { Args: never; Returns: undefined }
      generate_ts_code: { Args: { user_type_val: string }; Returns: string }
      generate_ts_profile_code:
        | { Args: never; Returns: string }
        | { Args: { p_user_type?: string }; Returns: string }
    }
    Enums: {
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
  public: {
    Enums: {
      user_type: ["personal", "business", "contractor"],
    },
  },
} as const
