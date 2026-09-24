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
        };
        Insert: {
          id?: string;
          table_id: string;
          status?: "ACTIVE" | "CLOSED";
          created_at?: string;
          closed_at?: string | null;
        };
        Update: {
          id?: string;
          table_id?: string;
          status?: "ACTIVE" | "CLOSED";
          created_at?: string;
          closed_at?: string | null;
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
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      is_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
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
export type DbTableQrToken = Database["public"]["Tables"]["table_qr_tokens"]["Row"];
export type DbTableOrderSession = Database["public"]["Tables"]["table_order_sessions"]["Row"];
export type DbCustomerScanSession = Database["public"]["Tables"]["customer_scan_sessions"]["Row"];

