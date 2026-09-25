-- ==============================================================================
-- Migration: 20260925000003_phase3_realtime_orders.sql
-- Description: Phase 3 - Enable Supabase Realtime publication for public.orders.
--              Sets REPLICA IDENTITY FULL for complete payload delivery on changes
--              and adds public.orders to supabase_realtime publication.
-- ==============================================================================

-- 1. Ensure REPLICA IDENTITY FULL on orders table
ALTER TABLE public.orders REPLICA IDENTITY FULL;

-- 2. Idempotently add public.orders to supabase_realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  END IF;
END $$;
