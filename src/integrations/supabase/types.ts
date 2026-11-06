export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      audit_events: {
        Row: {
          created_at: string;
          event_type: string;
          id: string;
          payload: Json;
          repair_order_id: string | null;
          shop_id: string;
          user_id: string | null;
        };
        Insert: {
          created_at?: string;
          event_type: string;
          id?: string;
          payload: Json;
          repair_order_id?: string | null;
          shop_id: string;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          event_type?: string;
          id?: string;
          payload?: Json;
          repair_order_id?: string | null;
          shop_id?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "audit_events_repair_order_id_fkey";
            columns: ["repair_order_id"];
            isOneToOne: false;
            referencedRelation: "board_orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audit_events_repair_order_id_fkey";
            columns: ["repair_order_id"];
            isOneToOne: false;
            referencedRelation: "repair_orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audit_events_shop_id_fkey";
            columns: ["shop_id"];
            isOneToOne: false;
            referencedRelation: "shops";
            referencedColumns: ["id"];
          },
        ];
      };
      bays: {
        Row: {
          bay_type: string;
          display_order: number;
          id: string;
          name: string;
          shop_id: string;
        };
        Insert: {
          bay_type?: string;
          display_order?: number;
          id?: string;
          name: string;
          shop_id: string;
        };
        Update: {
          bay_type?: string;
          display_order?: number;
          id?: string;
          name?: string;
          shop_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bays_shop_id_fkey";
            columns: ["shop_id"];
            isOneToOne: false;
            referencedRelation: "shops";
            referencedColumns: ["id"];
          },
        ];
      };
      customers: {
        Row: {
          communication_preferences: Json;
          created_at: string;
          email: string | null;
          first_name: string;
          id: string;
          last_name: string;
          phone_alternate: string | null;
          phone_mobile: string;
          shop_id: string;
          updated_at: string;
          whatsapp_opt_in: boolean;
          whatsapp_opt_in_at: string | null;
          whatsapp_opt_in_source: string | null;
          whatsapp_opted_out_at: string | null;
        };
        Insert: {
          communication_preferences?: Json;
          created_at?: string;
          email?: string | null;
          first_name: string;
          id?: string;
          last_name: string;
          phone_alternate?: string | null;
          phone_mobile: string;
          shop_id: string;
          updated_at?: string;
          whatsapp_opt_in?: boolean;
          whatsapp_opt_in_at?: string | null;
          whatsapp_opt_in_source?: string | null;
          whatsapp_opted_out_at?: string | null;
        };
        Update: {
          communication_preferences?: Json;
          created_at?: string;
          email?: string | null;
          first_name?: string;
          id?: string;
          last_name?: string;
          phone_alternate?: string | null;
          phone_mobile?: string;
          shop_id?: string;
          updated_at?: string;
          whatsapp_opt_in?: boolean;
          whatsapp_opt_in_at?: string | null;
          whatsapp_opt_in_source?: string | null;
          whatsapp_opted_out_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "customers_shop_id_fkey";
            columns: ["shop_id"];
            isOneToOne: false;
            referencedRelation: "shops";
            referencedColumns: ["id"];
          },
        ];
      };
      dvi_inspections: {
        Row: {
          access_token_expires_at: string | null;
          access_token_hash: string | null;
          consent_text: string | null;
          created_at: string;
          customer_authorized_at: string | null;
          customer_ip_address: string | null;
          customer_signature_key: string | null;
          customer_user_agent: string | null;
          customer_viewed_at: string | null;
          id: string;
          repair_order_id: string;
          sent_at: string | null;
          shop_id: string;
          submitted_at: string | null;
          technician_id: string | null;
          template_id: string;
          updated_at: string;
        };
        Insert: {
          access_token_expires_at?: string | null;
          access_token_hash?: string | null;
          consent_text?: string | null;
          created_at?: string;
          customer_authorized_at?: string | null;
          customer_ip_address?: string | null;
          customer_signature_key?: string | null;
          customer_user_agent?: string | null;
          customer_viewed_at?: string | null;
          id?: string;
          repair_order_id: string;
          sent_at?: string | null;
          shop_id: string;
          submitted_at?: string | null;
          technician_id?: string | null;
          template_id: string;
          updated_at?: string;
        };
        Update: {
          access_token_expires_at?: string | null;
          access_token_hash?: string | null;
          consent_text?: string | null;
          created_at?: string;
          customer_authorized_at?: string | null;
          customer_ip_address?: string | null;
          customer_signature_key?: string | null;
          customer_user_agent?: string | null;
          customer_viewed_at?: string | null;
          id?: string;
          repair_order_id?: string;
          sent_at?: string | null;
          shop_id?: string;
          submitted_at?: string | null;
          technician_id?: string | null;
          template_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "dvi_inspections_repair_order_id_fkey";
            columns: ["repair_order_id"];
            isOneToOne: false;
            referencedRelation: "board_orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "dvi_inspections_repair_order_id_fkey";
            columns: ["repair_order_id"];
            isOneToOne: false;
            referencedRelation: "repair_orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "dvi_inspections_shop_id_fkey";
            columns: ["shop_id"];
            isOneToOne: false;
            referencedRelation: "shops";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "dvi_inspections_technician_id_fkey";
            columns: ["technician_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "dvi_inspections_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "dvi_templates";
            referencedColumns: ["id"];
          },
        ];
      };
      dvi_items: {
        Row: {
          category: string;
          condition: string;
          created_at: string;
          customer_approved: boolean | null;
          dvi_id: string;
          estimated_cost: number | null;
          id: string;
          shop_id: string;
          technician_notes: string | null;
          title: string;
          updated_at: string;
        };
        Insert: {
          category: string;
          condition: string;
          created_at?: string;
          customer_approved?: boolean | null;
          dvi_id: string;
          estimated_cost?: number | null;
          id?: string;
          shop_id: string;
          technician_notes?: string | null;
          title: string;
          updated_at?: string;
        };
        Update: {
          category?: string;
          condition?: string;
          created_at?: string;
          customer_approved?: boolean | null;
          dvi_id?: string;
          estimated_cost?: number | null;
          id?: string;
          shop_id?: string;
          technician_notes?: string | null;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "dvi_items_dvi_id_fkey";
            columns: ["dvi_id"];
            isOneToOne: false;
            referencedRelation: "dvi_inspections";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "dvi_items_shop_id_fkey";
            columns: ["shop_id"];
            isOneToOne: false;
            referencedRelation: "shops";
            referencedColumns: ["id"];
          },
        ];
      };
      dvi_media: {
        Row: {
          annotation_data: Json | null;
          byte_size: number;
          content_type: string;
          created_at: string;
          dvi_item_id: string;
          id: string;
          media_type: string;
          shop_id: string;
          storage_key: string;
        };
        Insert: {
          annotation_data?: Json | null;
          byte_size: number;
          content_type: string;
          created_at?: string;
          dvi_item_id: string;
          id?: string;
          media_type?: string;
          shop_id: string;
          storage_key: string;
        };
        Update: {
          annotation_data?: Json | null;
          byte_size?: number;
          content_type?: string;
          created_at?: string;
          dvi_item_id?: string;
          id?: string;
          media_type?: string;
          shop_id?: string;
          storage_key?: string;
        };
        Relationships: [
          {
            foreignKeyName: "dvi_media_dvi_item_id_fkey";
            columns: ["dvi_item_id"];
            isOneToOne: false;
            referencedRelation: "dvi_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "dvi_media_shop_id_fkey";
            columns: ["shop_id"];
            isOneToOne: false;
            referencedRelation: "shops";
            referencedColumns: ["id"];
          },
        ];
      };
      dvi_templates: {
        Row: {
          categories: Json;
          id: string;
          is_default: boolean;
          shop_id: string;
          title: string;
        };
        Insert: {
          categories: Json;
          id?: string;
          is_default?: boolean;
          shop_id: string;
          title: string;
        };
        Update: {
          categories?: Json;
          id?: string;
          is_default?: boolean;
          shop_id?: string;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "dvi_templates_shop_id_fkey";
            columns: ["shop_id"];
            isOneToOne: false;
            referencedRelation: "shops";
            referencedColumns: ["id"];
          },
        ];
      };
      messages: {
        Row: {
          body: string;
          channel: string;
          created_at: string;
          customer_id: string;
          delivery_status: string;
          error_code: string | null;
          id: string;
          provider_message_id: string | null;
          repair_order_id: string | null;
          sender_user_id: string | null;
          shop_id: string;
          template_key: string;
          template_vars: Json;
        };
        Insert: {
          body: string;
          channel?: string;
          created_at?: string;
          customer_id: string;
          delivery_status?: string;
          error_code?: string | null;
          id?: string;
          provider_message_id?: string | null;
          repair_order_id?: string | null;
          sender_user_id?: string | null;
          shop_id: string;
          template_key: string;
          template_vars?: Json;
        };
        Update: {
          body?: string;
          channel?: string;
          created_at?: string;
          customer_id?: string;
          delivery_status?: string;
          error_code?: string | null;
          id?: string;
          provider_message_id?: string | null;
          repair_order_id?: string | null;
          sender_user_id?: string | null;
          shop_id?: string;
          template_key?: string;
          template_vars?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "messages_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "board_orders";
            referencedColumns: ["customer_id"];
          },
          {
            foreignKeyName: "messages_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_repair_order_id_fkey";
            columns: ["repair_order_id"];
            isOneToOne: false;
            referencedRelation: "board_orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_repair_order_id_fkey";
            columns: ["repair_order_id"];
            isOneToOne: false;
            referencedRelation: "repair_orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_sender_user_id_fkey";
            columns: ["sender_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_shop_id_fkey";
            columns: ["shop_id"];
            isOneToOne: false;
            referencedRelation: "shops";
            referencedColumns: ["id"];
          },
        ];
      };
      parts_vendors: {
        Row: {
          id: string;
          is_active: boolean;
          name: string;
          phone: string | null;
          shop_id: string;
        };
        Insert: {
          id?: string;
          is_active?: boolean;
          name: string;
          phone?: string | null;
          shop_id: string;
        };
        Update: {
          id?: string;
          is_active?: boolean;
          name?: string;
          phone?: string | null;
          shop_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "parts_vendors_shop_id_fkey";
            columns: ["shop_id"];
            isOneToOne: false;
            referencedRelation: "shops";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          email: string;
          first_name: string;
          id: string;
          is_active: boolean;
          last_name: string;
          legacy_user_id: string | null;
          phone_number: string | null;
          shop_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          email: string;
          first_name?: string;
          id: string;
          is_active?: boolean;
          last_name?: string;
          legacy_user_id?: string | null;
          phone_number?: string | null;
          shop_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          first_name?: string;
          id?: string;
          is_active?: boolean;
          last_name?: string;
          legacy_user_id?: string | null;
          phone_number?: string | null;
          shop_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_shop_id_fkey";
            columns: ["shop_id"];
            isOneToOne: false;
            referencedRelation: "shops";
            referencedColumns: ["id"];
          },
        ];
      };
      repair_orders: {
        Row: {
          assigned_technician_id: string | null;
          bay_id: string | null;
          concern: string | null;
          created_at: string;
          created_by: string | null;
          current_status_id: string;
          customer_id: string;
          dvi_status: string;
          eta_due_at: string | null;
          id: string;
          invoice_number: string | null;
          is_archived: boolean;
          keytag: string | null;
          parts_vendor_id: string | null;
          qc_status: string;
          ro_number: string;
          row_version: number;
          service_advisor_id: string | null;
          shop_id: string;
          status_updated_at: string;
          stock_number: string | null;
          updated_at: string;
          vehicle_id: string;
          wait_type: string;
        };
        Insert: {
          assigned_technician_id?: string | null;
          bay_id?: string | null;
          concern?: string | null;
          created_at?: string;
          created_by?: string | null;
          current_status_id: string;
          customer_id: string;
          dvi_status?: string;
          eta_due_at?: string | null;
          id?: string;
          invoice_number?: string | null;
          is_archived?: boolean;
          keytag?: string | null;
          parts_vendor_id?: string | null;
          qc_status?: string;
          ro_number: string;
          row_version?: number;
          service_advisor_id?: string | null;
          shop_id: string;
          status_updated_at?: string;
          stock_number?: string | null;
          updated_at?: string;
          vehicle_id: string;
          wait_type?: string;
        };
        Update: {
          assigned_technician_id?: string | null;
          bay_id?: string | null;
          concern?: string | null;
          created_at?: string;
          created_by?: string | null;
          current_status_id?: string;
          customer_id?: string;
          dvi_status?: string;
          eta_due_at?: string | null;
          id?: string;
          invoice_number?: string | null;
          is_archived?: boolean;
          keytag?: string | null;
          parts_vendor_id?: string | null;
          qc_status?: string;
          ro_number?: string;
          row_version?: number;
          service_advisor_id?: string | null;
          shop_id?: string;
          status_updated_at?: string;
          stock_number?: string | null;
          updated_at?: string;
          vehicle_id?: string;
          wait_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "repair_orders_assigned_technician_id_fkey";
            columns: ["assigned_technician_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "repair_orders_bay_id_fkey";
            columns: ["bay_id"];
            isOneToOne: false;
            referencedRelation: "bays";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "repair_orders_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "repair_orders_current_status_id_fkey";
            columns: ["current_status_id"];
            isOneToOne: false;
            referencedRelation: "status_pipelines";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "repair_orders_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "board_orders";
            referencedColumns: ["customer_id"];
          },
          {
            foreignKeyName: "repair_orders_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "repair_orders_parts_vendor_id_fkey";
            columns: ["parts_vendor_id"];
            isOneToOne: false;
            referencedRelation: "parts_vendors";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "repair_orders_service_advisor_id_fkey";
            columns: ["service_advisor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "repair_orders_shop_id_fkey";
            columns: ["shop_id"];
            isOneToOne: false;
            referencedRelation: "shops";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "repair_orders_vehicle_id_fkey";
            columns: ["vehicle_id"];
            isOneToOne: false;
            referencedRelation: "board_orders";
            referencedColumns: ["vehicle_id"];
          },
          {
            foreignKeyName: "repair_orders_vehicle_id_fkey";
            columns: ["vehicle_id"];
            isOneToOne: false;
            referencedRelation: "vehicles";
            referencedColumns: ["id"];
          },
        ];
      };
      ro_sequences: {
        Row: {
          next_value: number;
          shop_id: string;
        };
        Insert: {
          next_value?: number;
          shop_id: string;
        };
        Update: {
          next_value?: number;
          shop_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ro_sequences_shop_id_fkey";
            columns: ["shop_id"];
            isOneToOne: true;
            referencedRelation: "shops";
            referencedColumns: ["id"];
          },
        ];
      };
      shops: {
        Row: {
          address: Json;
          created_at: string;
          feature_flags: Json;
          id: string;
          name: string;
          phone_number: string | null;
          shop_mode: number;
          subdomain: string;
          tenant_id: string;
          timezone: string;
          updated_at: string;
          whatsapp_phone_number_id: string | null;
        };
        Insert: {
          address?: Json;
          created_at?: string;
          feature_flags?: Json;
          id?: string;
          name: string;
          phone_number?: string | null;
          shop_mode?: number;
          subdomain: string;
          tenant_id: string;
          timezone?: string;
          updated_at?: string;
          whatsapp_phone_number_id?: string | null;
        };
        Update: {
          address?: Json;
          created_at?: string;
          feature_flags?: Json;
          id?: string;
          name?: string;
          phone_number?: string | null;
          shop_mode?: number;
          subdomain?: string;
          tenant_id?: string;
          timezone?: string;
          updated_at?: string;
          whatsapp_phone_number_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "shops_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      staff_invites: {
        Row: {
          created_at: string;
          email: string;
          first_name: string;
          id: string;
          invited_by: string | null;
          last_name: string;
          role: Database["public"]["Enums"]["app_role"];
          shop_id: string;
        };
        Insert: {
          created_at?: string;
          email: string;
          first_name?: string;
          id?: string;
          invited_by?: string | null;
          last_name?: string;
          role: Database["public"]["Enums"]["app_role"];
          shop_id: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          first_name?: string;
          id?: string;
          invited_by?: string | null;
          last_name?: string;
          role?: Database["public"]["Enums"]["app_role"];
          shop_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "staff_invites_shop_id_fkey";
            columns: ["shop_id"];
            isOneToOne: false;
            referencedRelation: "shops";
            referencedColumns: ["id"];
          },
        ];
      };
      status_pipelines: {
        Row: {
          color_hex: string;
          cooldown_seconds: number;
          created_at: string;
          default_duration_minutes: number;
          id: string;
          is_terminal: boolean;
          label: string;
          requires_dvi_complete: boolean;
          requires_parts_vendor: boolean;
          requires_qc_signoff: boolean;
          shop_id: string;
          status_code: string;
          step_order: number;
          time_select_mode: number;
        };
        Insert: {
          color_hex: string;
          cooldown_seconds?: number;
          created_at?: string;
          default_duration_minutes?: number;
          id?: string;
          is_terminal?: boolean;
          label: string;
          requires_dvi_complete?: boolean;
          requires_parts_vendor?: boolean;
          requires_qc_signoff?: boolean;
          shop_id: string;
          status_code: string;
          step_order: number;
          time_select_mode?: number;
        };
        Update: {
          color_hex?: string;
          cooldown_seconds?: number;
          created_at?: string;
          default_duration_minutes?: number;
          id?: string;
          is_terminal?: boolean;
          label?: string;
          requires_dvi_complete?: boolean;
          requires_parts_vendor?: boolean;
          requires_qc_signoff?: boolean;
          shop_id?: string;
          status_code?: string;
          step_order?: number;
          time_select_mode?: number;
        };
        Relationships: [
          {
            foreignKeyName: "status_pipelines_shop_id_fkey";
            columns: ["shop_id"];
            isOneToOne: false;
            referencedRelation: "shops";
            referencedColumns: ["id"];
          },
        ];
      };
      tenants: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          plan_tier: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          plan_tier?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          plan_tier?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          shop_id: string;
          user_id: string;
        };
        Insert: {
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          shop_id: string;
          user_id: string;
        };
        Update: {
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          shop_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_roles_shop_id_fkey";
            columns: ["shop_id"];
            isOneToOne: false;
            referencedRelation: "shops";
            referencedColumns: ["id"];
          },
        ];
      };
      vehicles: {
        Row: {
          created_at: string;
          customer_id: string;
          engine: string | null;
          id: string;
          license_plate: string | null;
          make: string;
          model: string;
          odometer_in: number | null;
          shop_id: string;
          submodel: string | null;
          unit_number: string | null;
          updated_at: string;
          vin: string | null;
          year: number;
        };
        Insert: {
          created_at?: string;
          customer_id: string;
          engine?: string | null;
          id?: string;
          license_plate?: string | null;
          make: string;
          model: string;
          odometer_in?: number | null;
          shop_id: string;
          submodel?: string | null;
          unit_number?: string | null;
          updated_at?: string;
          vin?: string | null;
          year: number;
        };
        Update: {
          created_at?: string;
          customer_id?: string;
          engine?: string | null;
          id?: string;
          license_plate?: string | null;
          make?: string;
          model?: string;
          odometer_in?: number | null;
          shop_id?: string;
          submodel?: string | null;
          unit_number?: string | null;
          updated_at?: string;
          vin?: string | null;
          year?: number;
        };
        Relationships: [
          {
            foreignKeyName: "vehicles_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "board_orders";
            referencedColumns: ["customer_id"];
          },
          {
            foreignKeyName: "vehicles_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vehicles_shop_id_fkey";
            columns: ["shop_id"];
            isOneToOne: false;
            referencedRelation: "shops";
            referencedColumns: ["id"];
          },
        ];
      };
      webhook_events: {
        Row: {
          event_id: string;
          id: string;
          payload: Json;
          processed_at: string | null;
          provider: string;
          received_at: string;
          shop_id: string | null;
        };
        Insert: {
          event_id: string;
          id?: string;
          payload: Json;
          processed_at?: string | null;
          provider: string;
          received_at?: string;
          shop_id?: string | null;
        };
        Update: {
          event_id?: string;
          id?: string;
          payload?: Json;
          processed_at?: string | null;
          provider?: string;
          received_at?: string;
          shop_id?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      board_orders: {
        Row: {
          assigned_technician_id: string | null;
          bay_id: string | null;
          concern: string | null;
          created_at: string | null;
          current_status_id: string | null;
          customer_first_name: string | null;
          customer_id: string | null;
          customer_last_name: string | null;
          customer_phone: string | null;
          dvi_status: string | null;
          eta_due_at: string | null;
          id: string | null;
          is_archived: boolean | null;
          keytag: string | null;
          license_plate: string | null;
          parts_vendor_id: string | null;
          qc_status: string | null;
          ro_number: string | null;
          row_version: number | null;
          service_advisor_id: string | null;
          shop_id: string | null;
          status_updated_at: string | null;
          vehicle_id: string | null;
          vehicle_make: string | null;
          vehicle_model: string | null;
          vehicle_year: number | null;
          vin: string | null;
          wait_type: string | null;
          whatsapp_opt_in: boolean | null;
        };
        Relationships: [
          {
            foreignKeyName: "repair_orders_assigned_technician_id_fkey";
            columns: ["assigned_technician_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "repair_orders_bay_id_fkey";
            columns: ["bay_id"];
            isOneToOne: false;
            referencedRelation: "bays";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "repair_orders_current_status_id_fkey";
            columns: ["current_status_id"];
            isOneToOne: false;
            referencedRelation: "status_pipelines";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "repair_orders_parts_vendor_id_fkey";
            columns: ["parts_vendor_id"];
            isOneToOne: false;
            referencedRelation: "parts_vendors";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "repair_orders_service_advisor_id_fkey";
            columns: ["service_advisor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "repair_orders_shop_id_fkey";
            columns: ["shop_id"];
            isOneToOne: false;
            referencedRelation: "shops";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      archive_order: { Args: { p_order: string }; Returns: undefined };
      assign_bay: {
        Args: { p_bay: string; p_expected_version?: number; p_order: string };
        Returns: Json;
      };
      assign_technician: {
        Args: { p_order: string; p_tech: string };
        Returns: undefined;
      };
      current_shop_id: { Args: never; Returns: string };
      consume_api_rate_limit: {
        Args: {
          p_bucket: string;
          p_max_requests: number;
          p_subject: string;
          p_window_seconds: number;
        };
        Returns: boolean;
      };
      dvi_send: { Args: { p_dvi: string }; Returns: Json };
      dvi_start: { Args: { p_order: string }; Returns: string };
      dvi_submit: { Args: { p_dvi: string }; Returns: undefined };
      has_permission: { Args: { _perm: string }; Returns: boolean };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      portal_authorize: {
        Args: {
          p_consent: string;
          p_decisions: Json;
          p_ip: string;
          p_signature_key: string;
          p_token: string;
          p_ua: string;
        };
        Returns: Json;
      };
      portal_resolve: { Args: { p_token: string }; Returns: string };
      quick_add_order: { Args: { p: Json }; Returns: string };
      require_permission: { Args: { _perm: string }; Returns: string };
      role_permissions: {
        Args: { _role: Database["public"]["Enums"]["app_role"] };
        Returns: string[];
      };
      seed_shop: {
        Args: { p_shop: string; p_with_samples?: boolean };
        Returns: undefined;
      };
      set_whatsapp_consent: {
        Args: { p_customer: string; p_opt_in: boolean; p_source?: string };
        Returns: undefined;
      };
      set_staff_active: {
        Args: { p_active: boolean; p_user_id: string };
        Returns: undefined;
      };
      transition_order: {
        Args: {
          p_bay?: string;
          p_eta_minutes?: number;
          p_expected_version?: number;
          p_notes?: string;
          p_order: string;
          p_parts_vendor?: string;
          p_qc_signoff?: boolean;
          p_status: string;
          p_technician?: string;
        };
        Returns: Json;
      };
    };
    Enums: {
      app_role: "mso_admin" | "owner" | "advisor" | "technician" | "parts_specialist";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["mso_admin", "owner", "advisor", "technician", "parts_specialist"],
    },
  },
} as const;
