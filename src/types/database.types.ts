export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      attribute_definitions: {
        Row: {
          category_id: string | null;
          created_at: string;
          id: string;
          is_required: boolean;
          is_variant_option: boolean;
          key: string;
          label: string;
          options: string[];
          organization_id: string;
          sort_order: number;
          type: Database["public"]["Enums"]["attribute_type"];
          unit: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          category_id?: string | null;
          created_at?: string;
          id?: string;
          is_required?: boolean;
          is_variant_option?: boolean;
          key: string;
          label: string;
          options?: string[];
          organization_id: string;
          sort_order?: number;
          type?: Database["public"]["Enums"]["attribute_type"];
          unit?: string | null;
          updated_at?: string;
        };
        Update: {
          category_id?: string | null;
          created_at?: string;
          id?: string;
          is_required?: boolean;
          is_variant_option?: boolean;
          key?: string;
          label?: string;
          options?: string[];
          organization_id?: string;
          sort_order?: number;
          type?: Database["public"]["Enums"]["attribute_type"];
          unit?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "attribute_definitions_organization_id_category_id_fkey";
            columns: ["organization_id", "category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "attribute_definitions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_logs: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string;
          entity_id: string | null;
          entity_type: string;
          id: number;
          metadata: NonNullable<Json>;
          organization_id: string;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type: string;
          id?: never;
          metadata?: NonNullable<Json>;
          organization_id: string;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string;
          id?: never;
          metadata?: NonNullable<Json>;
          organization_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "audit_logs_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      categories: {
        Row: {
          created_at: string;
          description: string | null;
          gst_rate: number | null;
          hsn_code: string | null;
          id: string;
          industry: string | null;
          is_active: boolean;
          name: string;
          organization_id: string;
          parent_id: string | null;
          slug: string;
          sort_order: number;
          tracking: Database["public"]["Enums"]["inventory_tracking"];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          description?: string | null;
          gst_rate?: number | null;
          hsn_code?: string | null;
          id?: string;
          industry?: string | null;
          is_active?: boolean;
          name: string;
          organization_id: string;
          parent_id?: string | null;
          slug: string;
          sort_order?: number;
          tracking?: Database["public"]["Enums"]["inventory_tracking"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          gst_rate?: number | null;
          hsn_code?: string | null;
          id?: string;
          industry?: string | null;
          is_active?: boolean;
          name?: string;
          organization_id?: string;
          parent_id?: string | null;
          slug?: string;
          sort_order?: number;
          tracking?: Database["public"]["Enums"]["inventory_tracking"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "categories_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "categories_organization_id_parent_id_fkey";
            columns: ["organization_id", "parent_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      customers: {
        Row: {
          accepts_marketing: boolean;
          created_at: string;
          email: string | null;
          email_verified_at: string | null;
          full_name: string | null;
          id: string;
          organization_id: string;
          phone: string | null;
          tags: string[];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          accepts_marketing?: boolean;
          created_at?: string;
          email?: string | null;
          email_verified_at?: string | null;
          full_name?: string | null;
          id?: string;
          organization_id: string;
          phone?: string | null;
          tags?: string[];
          updated_at?: string;
        };
        Update: {
          accepts_marketing?: boolean;
          created_at?: string;
          email?: string | null;
          email_verified_at?: string | null;
          full_name?: string | null;
          id?: string;
          organization_id?: string;
          phone?: string | null;
          tags?: string[];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "customers_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory_batches: {
        Row: {
          batch_code: string;
          expiry_date: string | null;
          id: string;
          on_hand: number;
          organization_id: string;
          received_at: string;
          updated_at: string;
          variant_id: string;
          warehouse_id: string;
        };
        ComputedFields: never;
        Insert: {
          batch_code: string;
          expiry_date?: string | null;
          id?: string;
          on_hand?: number;
          organization_id: string;
          received_at?: string;
          updated_at?: string;
          variant_id: string;
          warehouse_id: string;
        };
        Update: {
          batch_code?: string;
          expiry_date?: string | null;
          id?: string;
          on_hand?: number;
          organization_id?: string;
          received_at?: string;
          updated_at?: string;
          variant_id?: string;
          warehouse_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_batches_organization_id_variant_id_fkey";
            columns: ["organization_id", "variant_id"];
            isOneToOne: false;
            referencedRelation: "product_variants";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "inventory_batches_organization_id_variant_id_fkey";
            columns: ["organization_id", "variant_id"];
            isOneToOne: false;
            referencedRelation: "variant_search";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "inventory_batches_organization_id_warehouse_id_fkey";
            columns: ["organization_id", "warehouse_id"];
            isOneToOne: false;
            referencedRelation: "warehouse_overview";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "inventory_batches_organization_id_warehouse_id_fkey";
            columns: ["organization_id", "warehouse_id"];
            isOneToOne: false;
            referencedRelation: "warehouses";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      inventory_levels: {
        Row: {
          available: number | null;
          on_hand: number;
          organization_id: string;
          reorder_point: number;
          reserved: number;
          updated_at: string;
          variant_id: string;
          warehouse_id: string;
        };
        ComputedFields: never;
        Insert: {
          available?: never;
          on_hand?: number;
          organization_id: string;
          reorder_point?: number;
          reserved?: number;
          updated_at?: string;
          variant_id: string;
          warehouse_id: string;
        };
        Update: {
          available?: never;
          on_hand?: number;
          organization_id?: string;
          reorder_point?: number;
          reserved?: number;
          updated_at?: string;
          variant_id?: string;
          warehouse_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_levels_organization_id_variant_id_fkey";
            columns: ["organization_id", "variant_id"];
            isOneToOne: false;
            referencedRelation: "product_variants";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "inventory_levels_organization_id_variant_id_fkey";
            columns: ["organization_id", "variant_id"];
            isOneToOne: false;
            referencedRelation: "variant_search";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "inventory_levels_organization_id_warehouse_id_fkey";
            columns: ["organization_id", "warehouse_id"];
            isOneToOne: false;
            referencedRelation: "warehouse_overview";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "inventory_levels_organization_id_warehouse_id_fkey";
            columns: ["organization_id", "warehouse_id"];
            isOneToOne: false;
            referencedRelation: "warehouses";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      inventory_serials: {
        Row: {
          id: string;
          organization_id: string;
          received_at: string;
          serial_number: string;
          status: Database["public"]["Enums"]["serial_status"];
          updated_at: string;
          variant_id: string;
          warehouse_id: string;
        };
        ComputedFields: never;
        Insert: {
          id?: string;
          organization_id: string;
          received_at?: string;
          serial_number: string;
          status?: Database["public"]["Enums"]["serial_status"];
          updated_at?: string;
          variant_id: string;
          warehouse_id: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          received_at?: string;
          serial_number?: string;
          status?: Database["public"]["Enums"]["serial_status"];
          updated_at?: string;
          variant_id?: string;
          warehouse_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_serials_organization_id_variant_id_fkey";
            columns: ["organization_id", "variant_id"];
            isOneToOne: false;
            referencedRelation: "product_variants";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "inventory_serials_organization_id_variant_id_fkey";
            columns: ["organization_id", "variant_id"];
            isOneToOne: false;
            referencedRelation: "variant_search";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "inventory_serials_organization_id_warehouse_id_fkey";
            columns: ["organization_id", "warehouse_id"];
            isOneToOne: false;
            referencedRelation: "warehouse_overview";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "inventory_serials_organization_id_warehouse_id_fkey";
            columns: ["organization_id", "warehouse_id"];
            isOneToOne: false;
            referencedRelation: "warehouses";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      member_shop_access: {
        Row: {
          created_at: string;
          member_id: string;
          shop_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          member_id: string;
          shop_id: string;
        };
        Update: {
          created_at?: string;
          member_id?: string;
          shop_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "member_shop_access_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "organization_members";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "member_shop_access_shop_id_fkey";
            columns: ["shop_id"];
            isOneToOne: false;
            referencedRelation: "shops";
            referencedColumns: ["id"];
          },
        ];
      };
      order_allocations: {
        Row: {
          created_at: string;
          id: string;
          order_id: string;
          order_item_id: string;
          organization_id: string;
          quantity: number;
          shipped_quantity: number;
          updated_at: string;
          variant_id: string;
          warehouse_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          order_id: string;
          order_item_id: string;
          organization_id: string;
          quantity: number;
          shipped_quantity?: number;
          updated_at?: string;
          variant_id: string;
          warehouse_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          order_id?: string;
          order_item_id?: string;
          organization_id?: string;
          quantity?: number;
          shipped_quantity?: number;
          updated_at?: string;
          variant_id?: string;
          warehouse_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "order_allocations_organization_id_order_id_fkey";
            columns: ["organization_id", "order_id"];
            isOneToOne: false;
            referencedRelation: "order_overview";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "order_allocations_organization_id_order_id_fkey";
            columns: ["organization_id", "order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "order_allocations_organization_id_order_item_id_fkey";
            columns: ["organization_id", "order_item_id"];
            isOneToOne: false;
            referencedRelation: "order_items";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "order_allocations_organization_id_variant_id_fkey";
            columns: ["organization_id", "variant_id"];
            isOneToOne: false;
            referencedRelation: "product_variants";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "order_allocations_organization_id_variant_id_fkey";
            columns: ["organization_id", "variant_id"];
            isOneToOne: false;
            referencedRelation: "variant_search";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "order_allocations_organization_id_warehouse_id_fkey";
            columns: ["organization_id", "warehouse_id"];
            isOneToOne: false;
            referencedRelation: "warehouse_overview";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "order_allocations_organization_id_warehouse_id_fkey";
            columns: ["organization_id", "warehouse_id"];
            isOneToOne: false;
            referencedRelation: "warehouses";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      order_events: {
        Row: {
          actor_id: string | null;
          created_at: string;
          id: number;
          message: string;
          metadata: NonNullable<Json>;
          order_id: string;
          organization_id: string;
          type: string;
        };
        ComputedFields: never;
        Insert: {
          actor_id?: string | null;
          created_at?: string;
          id?: never;
          message: string;
          metadata?: NonNullable<Json>;
          order_id: string;
          organization_id: string;
          type: string;
        };
        Update: {
          actor_id?: string | null;
          created_at?: string;
          id?: never;
          message?: string;
          metadata?: NonNullable<Json>;
          order_id?: string;
          organization_id?: string;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "order_events_organization_id_order_id_fkey";
            columns: ["organization_id", "order_id"];
            isOneToOne: false;
            referencedRelation: "order_overview";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "order_events_organization_id_order_id_fkey";
            columns: ["organization_id", "order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      order_items: {
        Row: {
          created_at: string;
          fulfilled_quantity: number;
          gst_rate: number;
          id: string;
          order_id: string;
          organization_id: string;
          quantity: number;
          sku: string;
          tax_amount: number;
          title: string;
          total: number | null;
          tracking: Database["public"]["Enums"]["inventory_tracking"];
          unit_price: number;
          variant_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          fulfilled_quantity?: number;
          gst_rate?: number;
          id?: string;
          order_id: string;
          organization_id: string;
          quantity: number;
          sku: string;
          tax_amount?: number;
          title: string;
          total?: never;
          tracking?: Database["public"]["Enums"]["inventory_tracking"];
          unit_price: number;
          variant_id?: string | null;
        };
        Update: {
          created_at?: string;
          fulfilled_quantity?: number;
          gst_rate?: number;
          id?: string;
          order_id?: string;
          organization_id?: string;
          quantity?: number;
          sku?: string;
          tax_amount?: number;
          title?: string;
          total?: never;
          tracking?: Database["public"]["Enums"]["inventory_tracking"];
          unit_price?: number;
          variant_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "order_items_organization_id_order_id_fkey";
            columns: ["organization_id", "order_id"];
            isOneToOne: false;
            referencedRelation: "order_overview";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "order_items_organization_id_order_id_fkey";
            columns: ["organization_id", "order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "order_items_organization_id_variant_id_fkey";
            columns: ["organization_id", "variant_id"];
            isOneToOne: false;
            referencedRelation: "product_variants";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "order_items_organization_id_variant_id_fkey";
            columns: ["organization_id", "variant_id"];
            isOneToOne: false;
            referencedRelation: "variant_search";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      orders: {
        Row: {
          cancel_reason: string | null;
          cancelled_at: string | null;
          completed_at: string | null;
          confirmed_at: string | null;
          created_at: string;
          currency: string;
          customer_id: string | null;
          discount_total: number;
          fulfillment_status: Database["public"]["Enums"]["fulfillment_status"];
          grand_total: number;
          id: string;
          notes: string | null;
          number: string;
          organization_id: string;
          paid_at: string | null;
          payment_method: Database["public"]["Enums"]["payment_method"] | null;
          payment_status: Database["public"]["Enums"]["payment_status"];
          placed_at: string;
          public_token: string;
          shipping_address: NonNullable<Json>;
          shipping_total: number;
          shop_id: string;
          source: string;
          status: Database["public"]["Enums"]["order_status"];
          subtotal: number;
          tax_total: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          completed_at?: string | null;
          confirmed_at?: string | null;
          created_at?: string;
          currency?: string;
          customer_id?: string | null;
          discount_total?: number;
          fulfillment_status?: Database["public"]["Enums"]["fulfillment_status"];
          grand_total?: number;
          id?: string;
          notes?: string | null;
          number: string;
          organization_id: string;
          paid_at?: string | null;
          payment_method?: Database["public"]["Enums"]["payment_method"] | null;
          payment_status?: Database["public"]["Enums"]["payment_status"];
          placed_at?: string;
          public_token?: string;
          shipping_address?: NonNullable<Json>;
          shipping_total?: number;
          shop_id: string;
          source?: string;
          status?: Database["public"]["Enums"]["order_status"];
          subtotal?: number;
          tax_total?: number;
          updated_at?: string;
        };
        Update: {
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          completed_at?: string | null;
          confirmed_at?: string | null;
          created_at?: string;
          currency?: string;
          customer_id?: string | null;
          discount_total?: number;
          fulfillment_status?: Database["public"]["Enums"]["fulfillment_status"];
          grand_total?: number;
          id?: string;
          notes?: string | null;
          number?: string;
          organization_id?: string;
          paid_at?: string | null;
          payment_method?: Database["public"]["Enums"]["payment_method"] | null;
          payment_status?: Database["public"]["Enums"]["payment_status"];
          placed_at?: string;
          public_token?: string;
          shipping_address?: NonNullable<Json>;
          shipping_total?: number;
          shop_id?: string;
          source?: string;
          status?: Database["public"]["Enums"]["order_status"];
          subtotal?: number;
          tax_total?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "orders_organization_id_customer_id_fkey";
            columns: ["organization_id", "customer_id"];
            isOneToOne: false;
            referencedRelation: "customer_overview";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "orders_organization_id_customer_id_fkey";
            columns: ["organization_id", "customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "orders_organization_id_shop_id_fkey";
            columns: ["organization_id", "shop_id"];
            isOneToOne: false;
            referencedRelation: "shops";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      organization_invitations: {
        Row: {
          accepted_at: string | null;
          created_at: string;
          email: string;
          expires_at: string;
          id: string;
          invited_by: string | null;
          organization_id: string;
          role: Database["public"]["Enums"]["org_role"];
        };
        ComputedFields: never;
        Insert: {
          accepted_at?: string | null;
          created_at?: string;
          email: string;
          expires_at?: string;
          id?: string;
          invited_by?: string | null;
          organization_id: string;
          role?: Database["public"]["Enums"]["org_role"];
        };
        Update: {
          accepted_at?: string | null;
          created_at?: string;
          email?: string;
          expires_at?: string;
          id?: string;
          invited_by?: string | null;
          organization_id?: string;
          role?: Database["public"]["Enums"]["org_role"];
        };
        Relationships: [
          {
            foreignKeyName: "organization_invitations_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      organization_members: {
        Row: {
          all_shops: boolean;
          created_at: string;
          id: string;
          organization_id: string;
          role: Database["public"]["Enums"]["org_role"];
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          all_shops?: boolean;
          created_at?: string;
          id?: string;
          organization_id: string;
          role?: Database["public"]["Enums"]["org_role"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          all_shops?: boolean;
          created_at?: string;
          id?: string;
          organization_id?: string;
          role?: Database["public"]["Enums"]["org_role"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      organizations: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          industries: string[];
          name: string;
          plan: Database["public"]["Enums"]["plan_tier"];
          slug: string;
          trial_ends_at: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          industries?: string[];
          name: string;
          plan?: Database["public"]["Enums"]["plan_tier"];
          slug: string;
          trial_ends_at?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          industries?: string[];
          name?: string;
          plan?: Database["public"]["Enums"]["plan_tier"];
          slug?: string;
          trial_ends_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      product_variants: {
        Row: {
          barcode: string | null;
          compare_at_price: number | null;
          cost_price: number | null;
          created_at: string;
          id: string;
          is_active: boolean;
          options: NonNullable<Json>;
          organization_id: string;
          price: number;
          product_id: string;
          sku: string;
          title: string;
          updated_at: string;
          weight_grams: number | null;
        };
        ComputedFields: never;
        Insert: {
          barcode?: string | null;
          compare_at_price?: number | null;
          cost_price?: number | null;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          options?: NonNullable<Json>;
          organization_id: string;
          price: number;
          product_id: string;
          sku: string;
          title?: string;
          updated_at?: string;
          weight_grams?: number | null;
        };
        Update: {
          barcode?: string | null;
          compare_at_price?: number | null;
          cost_price?: number | null;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          options?: NonNullable<Json>;
          organization_id?: string;
          price?: number;
          product_id?: string;
          sku?: string;
          title?: string;
          updated_at?: string;
          weight_grams?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "product_variants_organization_id_product_id_fkey";
            columns: ["organization_id", "product_id"];
            isOneToOne: false;
            referencedRelation: "product_overview";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "product_variants_organization_id_product_id_fkey";
            columns: ["organization_id", "product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      products: {
        Row: {
          attributes: NonNullable<Json>;
          category_id: string | null;
          created_at: string;
          created_by: string | null;
          description: string | null;
          gst_rate: number | null;
          hsn_code: string | null;
          id: string;
          organization_id: string;
          slug: string;
          status: Database["public"]["Enums"]["product_status"];
          tags: string[];
          title: string;
          tracking: Database["public"]["Enums"]["inventory_tracking"];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          attributes?: NonNullable<Json>;
          category_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          gst_rate?: number | null;
          hsn_code?: string | null;
          id?: string;
          organization_id: string;
          slug: string;
          status?: Database["public"]["Enums"]["product_status"];
          tags?: string[];
          title: string;
          tracking?: Database["public"]["Enums"]["inventory_tracking"];
          updated_at?: string;
        };
        Update: {
          attributes?: NonNullable<Json>;
          category_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          gst_rate?: number | null;
          hsn_code?: string | null;
          id?: string;
          organization_id?: string;
          slug?: string;
          status?: Database["public"]["Enums"]["product_status"];
          tags?: string[];
          title?: string;
          tracking?: Database["public"]["Enums"]["inventory_tracking"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "products_category_fk";
            columns: ["organization_id", "category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "products_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          email: string;
          full_name: string | null;
          id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          email: string;
          full_name?: string | null;
          id: string;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          email?: string;
          full_name?: string | null;
          id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      shipment_events: {
        Row: {
          created_at: string;
          description: string | null;
          id: number;
          location: string | null;
          occurred_at: string;
          organization_id: string;
          shipment_id: string;
          status: Database["public"]["Enums"]["shipment_status"];
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: never;
          location?: string | null;
          occurred_at?: string;
          organization_id: string;
          shipment_id: string;
          status: Database["public"]["Enums"]["shipment_status"];
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: never;
          location?: string | null;
          occurred_at?: string;
          organization_id?: string;
          shipment_id?: string;
          status?: Database["public"]["Enums"]["shipment_status"];
        };
        Relationships: [
          {
            foreignKeyName: "shipment_events_organization_id_shipment_id_fkey";
            columns: ["organization_id", "shipment_id"];
            isOneToOne: false;
            referencedRelation: "shipment_overview";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "shipment_events_organization_id_shipment_id_fkey";
            columns: ["organization_id", "shipment_id"];
            isOneToOne: false;
            referencedRelation: "shipments";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      shipment_items: {
        Row: {
          allocation_id: string;
          batches: NonNullable<Json>;
          created_at: string;
          id: string;
          order_item_id: string;
          organization_id: string;
          quantity: number;
          serial_numbers: string[];
          shipment_id: string;
        };
        ComputedFields: never;
        Insert: {
          allocation_id: string;
          batches?: NonNullable<Json>;
          created_at?: string;
          id?: string;
          order_item_id: string;
          organization_id: string;
          quantity: number;
          serial_numbers?: string[];
          shipment_id: string;
        };
        Update: {
          allocation_id?: string;
          batches?: NonNullable<Json>;
          created_at?: string;
          id?: string;
          order_item_id?: string;
          organization_id?: string;
          quantity?: number;
          serial_numbers?: string[];
          shipment_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "shipment_items_organization_id_allocation_id_fkey";
            columns: ["organization_id", "allocation_id"];
            isOneToOne: false;
            referencedRelation: "order_allocations";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "shipment_items_organization_id_order_item_id_fkey";
            columns: ["organization_id", "order_item_id"];
            isOneToOne: false;
            referencedRelation: "order_items";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "shipment_items_organization_id_shipment_id_fkey";
            columns: ["organization_id", "shipment_id"];
            isOneToOne: false;
            referencedRelation: "shipment_overview";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "shipment_items_organization_id_shipment_id_fkey";
            columns: ["organization_id", "shipment_id"];
            isOneToOne: false;
            referencedRelation: "shipments";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      shipments: {
        Row: {
          cancelled_at: string | null;
          carrier: string | null;
          created_at: string;
          delivered_at: string | null;
          delivery_attempts: number;
          delivery_otp_hash: string | null;
          estimated_delivery: string | null;
          id: string;
          number: string | null;
          order_id: string;
          organization_id: string;
          otp_attempts: number;
          otp_expires_at: string | null;
          returned_at: string | null;
          shipped_at: string | null;
          status: Database["public"]["Enums"]["shipment_status"];
          tracking_number: string | null;
          tracking_token: string;
          updated_at: string;
          warehouse_id: string;
        };
        ComputedFields: never;
        Insert: {
          cancelled_at?: string | null;
          carrier?: string | null;
          created_at?: string;
          delivered_at?: string | null;
          delivery_attempts?: number;
          delivery_otp_hash?: string | null;
          estimated_delivery?: string | null;
          id?: string;
          number?: string | null;
          order_id: string;
          organization_id: string;
          otp_attempts?: number;
          otp_expires_at?: string | null;
          returned_at?: string | null;
          shipped_at?: string | null;
          status?: Database["public"]["Enums"]["shipment_status"];
          tracking_number?: string | null;
          tracking_token?: string;
          updated_at?: string;
          warehouse_id: string;
        };
        Update: {
          cancelled_at?: string | null;
          carrier?: string | null;
          created_at?: string;
          delivered_at?: string | null;
          delivery_attempts?: number;
          delivery_otp_hash?: string | null;
          estimated_delivery?: string | null;
          id?: string;
          number?: string | null;
          order_id?: string;
          organization_id?: string;
          otp_attempts?: number;
          otp_expires_at?: string | null;
          returned_at?: string | null;
          shipped_at?: string | null;
          status?: Database["public"]["Enums"]["shipment_status"];
          tracking_number?: string | null;
          tracking_token?: string;
          updated_at?: string;
          warehouse_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "shipments_organization_id_order_id_fkey";
            columns: ["organization_id", "order_id"];
            isOneToOne: false;
            referencedRelation: "order_overview";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "shipments_organization_id_order_id_fkey";
            columns: ["organization_id", "order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "shipments_organization_id_warehouse_id_fkey";
            columns: ["organization_id", "warehouse_id"];
            isOneToOne: false;
            referencedRelation: "warehouse_overview";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "shipments_organization_id_warehouse_id_fkey";
            columns: ["organization_id", "warehouse_id"];
            isOneToOne: false;
            referencedRelation: "warehouses";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      shop_products: {
        Row: {
          created_at: string;
          is_published: boolean;
          organization_id: string;
          product_id: string;
          published_at: string | null;
          shop_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          is_published?: boolean;
          organization_id: string;
          product_id: string;
          published_at?: string | null;
          shop_id: string;
        };
        Update: {
          created_at?: string;
          is_published?: boolean;
          organization_id?: string;
          product_id?: string;
          published_at?: string | null;
          shop_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "shop_products_organization_id_product_id_fkey";
            columns: ["organization_id", "product_id"];
            isOneToOne: false;
            referencedRelation: "product_overview";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "shop_products_organization_id_product_id_fkey";
            columns: ["organization_id", "product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "shop_products_organization_id_shop_id_fkey";
            columns: ["organization_id", "shop_id"];
            isOneToOne: false;
            referencedRelation: "shops";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      shop_warehouses: {
        Row: {
          created_at: string;
          organization_id: string;
          priority: number;
          shop_id: string;
          warehouse_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          organization_id: string;
          priority?: number;
          shop_id: string;
          warehouse_id: string;
        };
        Update: {
          created_at?: string;
          organization_id?: string;
          priority?: number;
          shop_id?: string;
          warehouse_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "shop_warehouses_organization_id_shop_id_fkey";
            columns: ["organization_id", "shop_id"];
            isOneToOne: false;
            referencedRelation: "shops";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "shop_warehouses_organization_id_warehouse_id_fkey";
            columns: ["organization_id", "warehouse_id"];
            isOneToOne: false;
            referencedRelation: "warehouse_overview";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "shop_warehouses_organization_id_warehouse_id_fkey";
            columns: ["organization_id", "warehouse_id"];
            isOneToOne: false;
            referencedRelation: "warehouses";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      shops: {
        Row: {
          created_at: string;
          currency: string;
          custom_domain: string | null;
          id: string;
          name: string;
          order_prefix: string;
          organization_id: string;
          settings: NonNullable<Json>;
          slug: string;
          status: Database["public"]["Enums"]["shop_status"];
          timezone: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          currency?: string;
          custom_domain?: string | null;
          id?: string;
          name: string;
          order_prefix?: string;
          organization_id: string;
          settings?: NonNullable<Json>;
          slug: string;
          status?: Database["public"]["Enums"]["shop_status"];
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          currency?: string;
          custom_domain?: string | null;
          id?: string;
          name?: string;
          order_prefix?: string;
          organization_id?: string;
          settings?: NonNullable<Json>;
          slug?: string;
          status?: Database["public"]["Enums"]["shop_status"];
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "shops_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      stock_movements: {
        Row: {
          balance_after: number;
          batch_id: string | null;
          created_at: string;
          created_by: string | null;
          id: number;
          note: string | null;
          organization_id: string;
          quantity: number;
          reference_id: string | null;
          reference_type: string | null;
          serial_numbers: string[] | null;
          type: Database["public"]["Enums"]["stock_movement_type"];
          variant_id: string;
          warehouse_id: string;
        };
        ComputedFields: never;
        Insert: {
          balance_after: number;
          batch_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: never;
          note?: string | null;
          organization_id: string;
          quantity: number;
          reference_id?: string | null;
          reference_type?: string | null;
          serial_numbers?: string[] | null;
          type: Database["public"]["Enums"]["stock_movement_type"];
          variant_id: string;
          warehouse_id: string;
        };
        Update: {
          balance_after?: number;
          batch_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: never;
          note?: string | null;
          organization_id?: string;
          quantity?: number;
          reference_id?: string | null;
          reference_type?: string | null;
          serial_numbers?: string[] | null;
          type?: Database["public"]["Enums"]["stock_movement_type"];
          variant_id?: string;
          warehouse_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stock_movements_batch_fk";
            columns: ["organization_id", "batch_id"];
            isOneToOne: false;
            referencedRelation: "inventory_batches";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "stock_movements_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_movements_organization_id_variant_id_fkey";
            columns: ["organization_id", "variant_id"];
            isOneToOne: false;
            referencedRelation: "product_variants";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "stock_movements_organization_id_variant_id_fkey";
            columns: ["organization_id", "variant_id"];
            isOneToOne: false;
            referencedRelation: "variant_search";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "stock_movements_organization_id_warehouse_id_fkey";
            columns: ["organization_id", "warehouse_id"];
            isOneToOne: false;
            referencedRelation: "warehouse_overview";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "stock_movements_organization_id_warehouse_id_fkey";
            columns: ["organization_id", "warehouse_id"];
            isOneToOne: false;
            referencedRelation: "warehouses";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      warehouses: {
        Row: {
          address: NonNullable<Json>;
          code: string;
          created_at: string;
          id: string;
          is_active: boolean;
          name: string;
          organization_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          address?: NonNullable<Json>;
          code: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name: string;
          organization_id: string;
          updated_at?: string;
        };
        Update: {
          address?: NonNullable<Json>;
          code?: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          organization_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "warehouses_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      customer_overview: {
        Row: {
          accepts_marketing: boolean;
          created_at: string;
          email: string | null;
          email_verified_at: string | null;
          full_name: string | null;
          id: string;
          last_order_at: string | null;
          orders_count: number | null;
          organization_id: string;
          phone: string | null;
          search_text: string | null;
          tags: string[];
          total_spent: number | null;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "customers_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory_overview: {
        Row: {
          available: number | null;
          category_id: string | null;
          category_name: string | null;
          is_low: boolean | null;
          next_expiry: string | null;
          on_hand: number;
          organization_id: string;
          product_id: string;
          product_title: string;
          reorder_point: number;
          reserved: number;
          sku: string;
          tracking: Database["public"]["Enums"]["inventory_tracking"];
          updated_at: string;
          variant_id: string;
          variant_title: string;
          warehouse_code: string;
          warehouse_id: string;
          warehouse_name: string;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "inventory_levels_organization_id_variant_id_fkey";
            columns: ["organization_id", "variant_id"];
            isOneToOne: false;
            referencedRelation: "product_variants";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "inventory_levels_organization_id_variant_id_fkey";
            columns: ["organization_id", "variant_id"];
            isOneToOne: false;
            referencedRelation: "variant_search";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "inventory_levels_organization_id_warehouse_id_fkey";
            columns: ["organization_id", "warehouse_id"];
            isOneToOne: false;
            referencedRelation: "warehouse_overview";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "inventory_levels_organization_id_warehouse_id_fkey";
            columns: ["organization_id", "warehouse_id"];
            isOneToOne: false;
            referencedRelation: "warehouses";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      order_overview: {
        Row: {
          city: string | null;
          currency: string;
          customer_email: string | null;
          customer_id: string | null;
          customer_name: string | null;
          customer_phone: string | null;
          fulfillment_status: Database["public"]["Enums"]["fulfillment_status"];
          grand_total: number;
          id: string;
          item_count: number | null;
          number: string;
          organization_id: string;
          payment_method: Database["public"]["Enums"]["payment_method"] | null;
          payment_status: Database["public"]["Enums"]["payment_status"];
          placed_at: string;
          search_text: string | null;
          shop_id: string;
          shop_name: string;
          status: Database["public"]["Enums"]["order_status"];
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "orders_organization_id_customer_id_fkey";
            columns: ["organization_id", "customer_id"];
            isOneToOne: false;
            referencedRelation: "customer_overview";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "orders_organization_id_customer_id_fkey";
            columns: ["organization_id", "customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "orders_organization_id_shop_id_fkey";
            columns: ["organization_id", "shop_id"];
            isOneToOne: false;
            referencedRelation: "shops";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      product_overview: {
        Row: {
          available: number | null;
          category_id: string | null;
          category_name: string | null;
          created_at: string;
          id: string;
          low_stock_locations: number | null;
          max_price: number | null;
          min_price: number | null;
          on_hand: number | null;
          organization_id: string;
          slug: string;
          status: Database["public"]["Enums"]["product_status"];
          title: string;
          tracking: Database["public"]["Enums"]["inventory_tracking"];
          updated_at: string;
          variant_count: number | null;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "products_category_fk";
            columns: ["organization_id", "category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "products_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      shipment_overview: {
        Row: {
          carrier: string | null;
          city: string | null;
          created_at: string;
          currency: string;
          delivered_at: string | null;
          delivery_attempts: number;
          estimated_delivery: string | null;
          grand_total: number;
          id: string;
          item_count: number | null;
          number: string | null;
          order_id: string;
          order_number: string;
          organization_id: string;
          payment_method: Database["public"]["Enums"]["payment_method"] | null;
          payment_status: Database["public"]["Enums"]["payment_status"];
          recipient_name: string | null;
          recipient_phone: string | null;
          shipped_at: string | null;
          shop_id: string;
          status: Database["public"]["Enums"]["shipment_status"];
          tracking_number: string | null;
          tracking_token: string;
          updated_at: string;
          warehouse_id: string;
          warehouse_name: string;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "shipments_organization_id_order_id_fkey";
            columns: ["organization_id", "order_id"];
            isOneToOne: false;
            referencedRelation: "order_overview";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "shipments_organization_id_order_id_fkey";
            columns: ["organization_id", "order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "shipments_organization_id_warehouse_id_fkey";
            columns: ["organization_id", "warehouse_id"];
            isOneToOne: false;
            referencedRelation: "warehouse_overview";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "shipments_organization_id_warehouse_id_fkey";
            columns: ["organization_id", "warehouse_id"];
            isOneToOne: false;
            referencedRelation: "warehouses";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      variant_search: {
        Row: {
          gst_rate: number | null;
          id: string;
          organization_id: string;
          price: number;
          product_id: string;
          product_status: Database["public"]["Enums"]["product_status"];
          product_title: string;
          search_text: string | null;
          sku: string;
          tracking: Database["public"]["Enums"]["inventory_tracking"];
          variant_title: string;
        };
        ComputedFields: never;
        Relationships: [];
      };
      warehouse_overview: {
        Row: {
          address: NonNullable<Json>;
          code: string;
          created_at: string;
          id: string;
          is_active: boolean;
          low_stock_skus: number | null;
          name: string;
          organization_id: string;
          shop_ids: string[] | null;
          skus_in_stock: number | null;
          units_on_hand: number | null;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "warehouses_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      add_industries: {
        Args: { p_industries: string[]; p_organization_id: string };
        Returns: undefined;
      };
      adjust_stock: {
        Args: {
          p_note?: string;
          p_quantity: number;
          p_reference_id?: string;
          p_reference_type?: string;
          p_type: Database["public"]["Enums"]["stock_movement_type"];
          p_variant_id: string;
          p_warehouse_id: string;
        };
        Returns: {
          available: number | null;
          on_hand: number;
          organization_id: string;
          reorder_point: number;
          reserved: number;
          updated_at: string;
          variant_id: string;
          warehouse_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "inventory_levels";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      cancel_order: { Args: { p_order_id: string; p_reason?: string }; Returns: undefined };
      confirm_delivery: { Args: { p_otp: string; p_shipment_id: string }; Returns: Json };
      confirm_order: { Args: { p_order_id: string }; Returns: undefined };
      create_order: {
        Args: {
          p_address: Json;
          p_confirm?: boolean;
          p_customer: Json;
          p_discount_total?: number;
          p_items: Json;
          p_notes?: string;
          p_payment_method: Database["public"]["Enums"]["payment_method"];
          p_payment_status?: Database["public"]["Enums"]["payment_status"];
          p_shipping_total?: number;
          p_shop_id: string;
        };
        Returns: string;
      };
      create_organization: {
        Args: {
          p_currency: string;
          p_industries?: string[];
          p_name: string;
          p_shop_name: string;
          p_shop_slug: string;
          p_slug: string;
          p_warehouse_city: string;
          p_warehouse_code: string;
          p_warehouse_name: string;
        };
        Returns: Json;
      };
      create_product: {
        Args: {
          p_organization_id: string;
          p_product: Json;
          p_shop_ids?: string[];
          p_variants: Json;
        };
        Returns: string;
      };
      create_shipment: {
        Args: {
          p_carrier?: string;
          p_estimated_delivery?: string;
          p_items: Json;
          p_order_id: string;
          p_tracking_number?: string;
          p_warehouse_id: string;
        };
        Returns: string;
      };
      get_overview_stats: {
        Args: { p_organization_id: string; p_shop_id?: string };
        Returns: Json;
      };
      get_tracking: { Args: { p_token: string }; Returns: Json };
      mark_order_paid: { Args: { p_order_id: string }; Returns: undefined };
      receive_stock: {
        Args: {
          p_batch_code?: string;
          p_expiry_date?: string;
          p_note?: string;
          p_quantity?: number;
          p_serials?: string[];
          p_type?: Database["public"]["Enums"]["stock_movement_type"];
          p_variant_id: string;
          p_warehouse_id: string;
        };
        Returns: {
          available: number | null;
          on_hand: number;
          organization_id: string;
          reorder_point: number;
          reserved: number;
          updated_at: string;
          variant_id: string;
          warehouse_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "inventory_levels";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      remove_stock: {
        Args: {
          p_batch_id?: string;
          p_note?: string;
          p_quantity?: number;
          p_serials?: string[];
          p_type: Database["public"]["Enums"]["stock_movement_type"];
          p_variant_id: string;
          p_warehouse_id: string;
        };
        Returns: {
          available: number | null;
          on_hand: number;
          organization_id: string;
          reorder_point: number;
          reserved: number;
          updated_at: string;
          variant_id: string;
          warehouse_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "inventory_levels";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      set_warehouse_shops: {
        Args: { p_shop_ids: string[]; p_warehouse_id: string };
        Returns: undefined;
      };
      storefront_catalog: {
        Args: {
          p_category_id?: string;
          p_limit?: number;
          p_offset?: number;
          p_search?: string;
          p_shop_id: string;
          p_sort?: string;
        };
        Returns: Json;
      };
      storefront_categories: { Args: { p_shop_id: string }; Returns: Json };
      storefront_checkout_confirm: {
        Args: { p_checkout_id: string; p_otp: string };
        Returns: Json;
      };
      storefront_checkout_resend: { Args: { p_checkout_id: string }; Returns: Json };
      storefront_checkout_start: {
        Args: {
          p_address: Json;
          p_contact: Json;
          p_lines: Json;
          p_payment_method?: Database["public"]["Enums"]["payment_method"];
          p_shop_id: string;
        };
        Returns: Json;
      };
      storefront_order: { Args: { p_token: string }; Returns: Json };
      storefront_product: { Args: { p_shop_id: string; p_slug: string }; Returns: Json };
      storefront_shop: { Args: { p_slug: string }; Returns: Json };
      storefront_variants: { Args: { p_shop_id: string; p_variant_ids: string[] }; Returns: Json };
      transfer_stock: {
        Args: {
          p_batch_id?: string;
          p_from_warehouse_id: string;
          p_note?: string;
          p_quantity?: number;
          p_serials?: string[];
          p_to_warehouse_id: string;
          p_variant_id: string;
        };
        Returns: string;
      };
      update_product: {
        Args: { p_product: Json; p_product_id: string; p_shop_ids?: string[]; p_variants: Json };
        Returns: undefined;
      };
      update_shipment_status: {
        Args: {
          p_description?: string;
          p_location?: string;
          p_shipment_id: string;
          p_status: Database["public"]["Enums"]["shipment_status"];
        };
        Returns: string;
      };
    };
    Enums: {
      attribute_type: "text" | "number" | "boolean" | "select" | "multiselect" | "date";
      fulfillment_status: "unfulfilled" | "partially_fulfilled" | "fulfilled" | "returned";
      inventory_tracking: "quantity" | "serial" | "batch";
      order_status: "pending" | "confirmed" | "cancelled" | "completed";
      org_role: "owner" | "admin" | "manager" | "staff" | "support";
      payment_method: "upi" | "card" | "netbanking" | "wallet" | "cod" | "store_credit";
      payment_status:
        "pending" | "authorized" | "paid" | "partially_refunded" | "refunded" | "failed";
      plan_tier: "trial" | "starter" | "growth" | "scale";
      product_status: "draft" | "active" | "archived";
      serial_status: "in_stock" | "sold" | "damaged" | "written_off";
      shipment_status:
        | "pending"
        | "packed"
        | "picked_up"
        | "in_transit"
        | "out_for_delivery"
        | "delivered"
        | "failed_attempt"
        | "returned_to_origin"
        | "cancelled";
      shop_status: "draft" | "live" | "paused" | "archived";
      stock_movement_type:
        "receipt" | "adjustment" | "sale" | "return" | "transfer_out" | "transfer_in" | "damage";
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
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      attribute_type: ["text", "number", "boolean", "select", "multiselect", "date"],
      fulfillment_status: ["unfulfilled", "partially_fulfilled", "fulfilled", "returned"],
      inventory_tracking: ["quantity", "serial", "batch"],
      order_status: ["pending", "confirmed", "cancelled", "completed"],
      org_role: ["owner", "admin", "manager", "staff", "support"],
      payment_method: ["upi", "card", "netbanking", "wallet", "cod", "store_credit"],
      payment_status: ["pending", "authorized", "paid", "partially_refunded", "refunded", "failed"],
      plan_tier: ["trial", "starter", "growth", "scale"],
      product_status: ["draft", "active", "archived"],
      serial_status: ["in_stock", "sold", "damaged", "written_off"],
      shipment_status: [
        "pending",
        "packed",
        "picked_up",
        "in_transit",
        "out_for_delivery",
        "delivered",
        "failed_attempt",
        "returned_to_origin",
        "cancelled",
      ],
      shop_status: ["draft", "live", "paused", "archived"],
      stock_movement_type: [
        "receipt",
        "adjustment",
        "sale",
        "return",
        "transfer_out",
        "transfer_in",
        "damage",
      ],
    },
  },
} as const;
