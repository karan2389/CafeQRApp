export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      branches: {
        Row: {
          id: string;
          name: string;
          slug: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      tables: {
        Row: {
          id: string;
          branch_id: string;
          table_number: number;
          display_name: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          branch_id: string;
          table_number: number;
          display_name?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          branch_id?: string;
          table_number?: number;
          display_name?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tables_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          }
        ];
      };
      menu_categories: {
        Row: {
          id: string;
          branch_id: string;
          name: string;
          slug: string;
          display_order: number;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          branch_id: string;
          name: string;
          slug: string;
          display_order?: number;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          branch_id?: string;
          name?: string;
          slug?: string;
          display_order?: number;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "menu_categories_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          }
        ];
      };
      menu_items: {
        Row: {
          id: string;
          category_id: string;
          name: string;
          description: string | null;
          price: number;
          image_url: string | null;
          is_available: boolean;
          requires_age_confirmation: boolean;
          display_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          category_id: string;
          name: string;
          description?: string | null;
          price: number;
          image_url?: string | null;
          is_available?: boolean;
          requires_age_confirmation?: boolean;
          display_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          category_id?: string;
          name?: string;
          description?: string | null;
          price?: number;
          image_url?: string | null;
          is_available?: boolean;
          requires_age_confirmation?: boolean;
          display_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "menu_items_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "menu_categories";
            referencedColumns: ["id"];
          }
        ];
      };
      admin_users: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          role: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          role?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          role?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      staff_users: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          role: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          role?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          role?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      table_qr_tokens: {
        Row: {
          table_id: string;
          qr_token_hash: string;
          generated_at: string;
        };
        Insert: {
          table_id: string;
          qr_token_hash: string;
          generated_at?: string;
        };
        Update: {
          table_id?: string;
          qr_token_hash?: string;
          generated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "table_qr_tokens_table_id_fkey";
            columns: ["table_id"];
            isOneToOne: true;
            referencedRelation: "tables";
            referencedColumns: ["id"];
          }
        ];
      };
      table_order_sessions: {
        Row: {
          id: string;
          table_id: string;
          status: "ACTIVE" | "CLOSED";
          created_at: string;
          closed_at: string | null;
          closed_by: string | null;
          payment_confirmed_at: string | null;
          payment_confirmed_by: string | null;
          payment_method: "CASH" | "CARD" | "UPI" | "OTHER" | null;
          final_bill_amount_inr: number | null;
          final_bill_amount_paise: number | null;
        };
        Insert: {
          id?: string;
          table_id: string;
          status?: "ACTIVE" | "CLOSED";
          created_at?: string;
          closed_at?: string | null;
          closed_by?: string | null;
          payment_confirmed_at?: string | null;
          payment_confirmed_by?: string | null;
          payment_method?: "CASH" | "CARD" | "UPI" | "OTHER" | null;
          final_bill_amount_inr?: number | null;
          final_bill_amount_paise?: number | null;
        };
        Update: {
          id?: string;
          table_id?: string;
          status?: "ACTIVE" | "CLOSED";
          created_at?: string;
          closed_at?: string | null;
          closed_by?: string | null;
          payment_confirmed_at?: string | null;
          payment_confirmed_by?: string | null;
          payment_method?: "CASH" | "CARD" | "UPI" | "OTHER" | null;
          final_bill_amount_inr?: number | null;
          final_bill_amount_paise?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "table_order_sessions_table_id_fkey";
            columns: ["table_id"];
            isOneToOne: false;
            referencedRelation: "tables";
            referencedColumns: ["id"];
          }
        ];
      };
      customer_scan_sessions: {
        Row: {
          id: string;
          table_order_session_id: string;
          session_token_hash: string;
          created_at: string;
          expires_at: string;
        };
        Insert: {
          id?: string;
          table_order_session_id: string;
          session_token_hash: string;
          created_at?: string;
          expires_at?: string;
        };
        Update: {
          id?: string;
          table_order_session_id?: string;
          session_token_hash?: string;
          created_at?: string;
          expires_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "customer_scan_sessions_table_order_session_id_fkey";
            columns: ["table_order_session_id"];
            isOneToOne: false;
            referencedRelation: "table_order_sessions";
            referencedColumns: ["id"];
          }
        ];
      };
      orders: {
        Row: {
          id: string;
          table_order_session_id: string;
          table_id: string;
          customer_scan_session_id: string;
          order_number: string | null;
          customer_name: string | null;
          order_notes: string | null;
          total_amount_inr: number;
          status: string;
          cancellation_reason?: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          table_order_session_id: string;
          table_id: string;
          customer_scan_session_id: string;
          order_number?: string | null;
          customer_name?: string | null;
          order_notes?: string | null;
          total_amount_inr?: number;
          status?: string;
          cancellation_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          table_order_session_id?: string;
          table_id?: string;
          customer_scan_session_id?: string;
          order_number?: string | null;
          customer_name?: string | null;
          order_notes?: string | null;
          total_amount_inr?: number;
          status?: string;
          cancellation_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "orders_table_order_session_id_fkey";
            columns: ["table_order_session_id"];
            isOneToOne: false;
            referencedRelation: "table_order_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_table_id_fkey";
            columns: ["table_id"];
            isOneToOne: false;
            referencedRelation: "tables";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_customer_scan_session_id_fkey";
            columns: ["customer_scan_session_id"];
            isOneToOne: false;
            referencedRelation: "customer_scan_sessions";
            referencedColumns: ["id"];
          }
        ];
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          menu_item_id: string | null;
          item_name: string;
          unit_price_inr: number;
          quantity: number;
          customization_notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          menu_item_id?: string | null;
          item_name: string;
          unit_price_inr: number;
          quantity: number;
          customization_notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          menu_item_id?: string | null;
          item_name?: string;
          unit_price_inr?: number;
          quantity?: number;
          customization_notes?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_menu_item_id_fkey";
            columns: ["menu_item_id"];
            isOneToOne: false;
            referencedRelation: "menu_items";
            referencedColumns: ["id"];
          }
        ];
      };
      service_requests: {
        Row: {
          id: string;
          table_id: string;
          table_order_session_id: string;
          customer_scan_session_id: string;
          request_type: "CALL_STAFF" | "REQUEST_WATER" | "REQUEST_BILL" | "REQUEST_ASSISTANCE";
          note: string | null;
          status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED" | "CANCELLED";
          acknowledged_at: string | null;
          resolved_at: string | null;
          acknowledged_by: string | null;
          resolved_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          table_id: string;
          table_order_session_id: string;
          customer_scan_session_id: string;
          request_type: "CALL_STAFF" | "REQUEST_WATER" | "REQUEST_BILL" | "REQUEST_ASSISTANCE";
          note?: string | null;
          status?: "OPEN" | "ACKNOWLEDGED" | "RESOLVED" | "CANCELLED";
          acknowledged_at?: string | null;
          resolved_at?: string | null;
          acknowledged_by?: string | null;
          resolved_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          table_id?: string;
          table_order_session_id?: string;
          customer_scan_session_id?: string;
          request_type?: "CALL_STAFF" | "REQUEST_WATER" | "REQUEST_BILL" | "REQUEST_ASSISTANCE";
          note?: string | null;
          status?: "OPEN" | "ACKNOWLEDGED" | "RESOLVED" | "CANCELLED";
          acknowledged_at?: string | null;
          resolved_at?: string | null;
          acknowledged_by?: string | null;
          resolved_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "service_requests_table_id_fkey";
            columns: ["table_id"];
            isOneToOne: false;
            referencedRelation: "tables";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "service_requests_table_order_session_id_fkey";
            columns: ["table_order_session_id"];
            isOneToOne: false;
            referencedRelation: "table_order_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "service_requests_customer_scan_session_id_fkey";
            columns: ["customer_scan_session_id"];
            isOneToOne: false;
            referencedRelation: "customer_scan_sessions";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      is_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      is_staff: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      is_staff_or_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      close_table_session: {
        Args: {
          p_session_id: string;
          p_staff_user_id?: string | null;
          p_payment_method?: string | null;
          p_force?: boolean | null;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}

export type DbBranch = Database["public"]["Tables"]["branches"]["Row"];
export type DbTable = Database["public"]["Tables"]["tables"]["Row"];
export type DbMenuCategory = Database["public"]["Tables"]["menu_categories"]["Row"];
export type DbMenuItem = Database["public"]["Tables"]["menu_items"]["Row"];
export type DbAdminUser = Database["public"]["Tables"]["admin_users"]["Row"];
export type DbStaffUser = Database["public"]["Tables"]["staff_users"]["Row"];
export type DbTableQrToken = Database["public"]["Tables"]["table_qr_tokens"]["Row"];
export type DbTableOrderSession = Database["public"]["Tables"]["table_order_sessions"]["Row"];
export type DbCustomerScanSession = Database["public"]["Tables"]["customer_scan_sessions"]["Row"];
export type DbOrder = Database["public"]["Tables"]["orders"]["Row"];
export type DbOrderItem = Database["public"]["Tables"]["order_items"]["Row"];
export type DbServiceRequest = Database["public"]["Tables"]["service_requests"]["Row"];

