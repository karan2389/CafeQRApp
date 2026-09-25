-- ==============================================================================
-- Migration: 20260925000002_phase2_orders_and_kitchen.sql
-- Description: Phase 2 - Orders Data Model and Kitchen Staff Access Policies.
--              Enhances orders table with human-readable ticket numbers, customer
--              names, order-level notes, and total INR snapshots.
--              Adds RLS policies for kitchen_staff to view and update orders.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Ensure Orders and Order Items Tables Exist (Idempotent)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_order_session_id UUID NOT NULL REFERENCES public.table_order_sessions(id) ON DELETE CASCADE,
    table_id UUID NOT NULL REFERENCES public.tables(id) ON DELETE CASCADE,
    customer_scan_session_id UUID NOT NULL REFERENCES public.customer_scan_sessions(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    menu_item_id UUID REFERENCES public.menu_items(id) ON DELETE SET NULL,
    item_name TEXT NOT NULL,
    unit_price_inr NUMERIC(10, 2) NOT NULL,
    quantity INT NOT NULL CHECK (quantity > 0),
    customization_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------------------
-- 2. Add New Columns to Orders
-- ------------------------------------------------------------------------------
ALTER TABLE public.orders 
  ADD COLUMN IF NOT EXISTS order_number TEXT,
  ADD COLUMN IF NOT EXISTS customer_name TEXT,
  ADD COLUMN IF NOT EXISTS order_notes TEXT,
  ADD COLUMN IF NOT EXISTS total_amount_inr NUMERIC(10, 2) NOT NULL DEFAULT 0.00;

-- Ensure total_amount_inr is non-negative
ALTER TABLE public.orders 
  DROP CONSTRAINT IF EXISTS orders_total_amount_inr_check;
ALTER TABLE public.orders 
  ADD CONSTRAINT orders_total_amount_inr_check CHECK (total_amount_inr >= 0);

-- Update status check constraint to support lifecycle: PENDING, NEW, PREPARING, DELIVERED, PAID, CANCELLED
ALTER TABLE public.orders 
  DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders 
  ADD CONSTRAINT orders_status_check 
  CHECK (status IN ('PENDING', 'NEW', 'PREPARING', 'DELIVERED', 'PAID', 'CANCELLED'));

-- ------------------------------------------------------------------------------
-- 3. Performance Indexes
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_orders_session_id ON public.orders(table_order_session_id);
CREATE INDEX IF NOT EXISTS idx_orders_table_id ON public.orders(table_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);

-- ------------------------------------------------------------------------------
-- 4. Updated At Trigger for Orders
-- ------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_orders_updated_at ON public.orders;
CREATE TRIGGER trg_orders_updated_at
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.handle_admin_updated_at();

-- ------------------------------------------------------------------------------
-- 5. Row Level Security (RLS) on Orders & Order Items
-- ------------------------------------------------------------------------------
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- A. Staff and Admin SELECT on orders
DROP POLICY IF EXISTS "staff_orders_select" ON public.orders;
CREATE POLICY "staff_orders_select"
ON public.orders
FOR SELECT
TO authenticated
USING (public.is_staff_or_admin());

-- B. Staff and Admin UPDATE on orders (for kitchen status lifecycle)
DROP POLICY IF EXISTS "staff_orders_update" ON public.orders;
CREATE POLICY "staff_orders_update"
ON public.orders
FOR UPDATE
TO authenticated
USING (public.is_staff_or_admin())
WITH CHECK (public.is_staff_or_admin());

-- C. Staff and Admin SELECT on order_items
DROP POLICY IF EXISTS "staff_order_items_select" ON public.order_items;
CREATE POLICY "staff_order_items_select"
ON public.order_items
FOR SELECT
TO authenticated
USING (public.is_staff_or_admin());

-- D. Customer Direct Mutation Policies:
-- Client INSERT / UPDATE / DELETE are blocked. All customer order creation
-- and price snapshotting are strictly handled via the server-side API or security-definer RPCs
-- to guarantee that prices, totals, and session validity cannot be forged.
DROP POLICY IF EXISTS "orders_customer_insert_blocked" ON public.orders;
DROP POLICY IF EXISTS "orders_customer_delete_blocked" ON public.orders;
DROP POLICY IF EXISTS "order_items_customer_insert_blocked" ON public.order_items;
DROP POLICY IF EXISTS "order_items_customer_delete_blocked" ON public.order_items;
