-- ==============================================================================
-- Migration: 20260925000004_phase4_kitchen_order_lifecycle.sql
-- Description: Phase 4 - Kitchen Order Processing & Lifecycle Optimization
--              1. Adds cancellation_reason column for auditability on cancelled orders.
--              2. Creates composite index for kitchen queue queries (status, created_at).
--              3. Ensures updated_at trigger is active on public.orders.
-- ==============================================================================

-- 1. Add cancellation_reason column to public.orders (Idempotent)
ALTER TABLE public.orders 
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

-- 2. Composite index for kitchen active queue and status queries
CREATE INDEX IF NOT EXISTS idx_orders_status_created_at 
  ON public.orders (status, created_at DESC);

-- 3. Automatic updated_at trigger for public.orders
CREATE OR REPLACE FUNCTION public.set_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_orders_updated_at ON public.orders;
CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.set_orders_updated_at();
