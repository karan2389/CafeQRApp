-- ==============================================================================
-- Migration: 20260925000005_phase6_service_requests.sql
-- Description: Phase 6 - Call Staff & Kitchen Service Request Notifications
--              1. Creates public.service_requests table with request types & status.
--              2. Adds indexes for performance (status, created_at, session, table).
--              3. Configures automatic updated_at trigger.
--              4. Configures RLS policies for staff access.
--              5. Adds public.service_requests to supabase_realtime publication.
-- ==============================================================================

-- 1. Create service_requests table
CREATE TABLE IF NOT EXISTS public.service_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id UUID NOT NULL REFERENCES public.tables(id) ON DELETE CASCADE,
  table_order_session_id UUID NOT NULL REFERENCES public.table_order_sessions(id) ON DELETE CASCADE,
  customer_scan_session_id UUID NOT NULL REFERENCES public.customer_scan_sessions(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL CHECK (request_type IN ('CALL_STAFF', 'REQUEST_WATER', 'REQUEST_BILL', 'REQUEST_ASSISTANCE')),
  note TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'CANCELLED')),
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 2. Indexes for operational queues and session queries
CREATE INDEX IF NOT EXISTS idx_service_requests_status_created 
  ON public.service_requests (status, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_service_requests_session 
  ON public.service_requests (table_order_session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_service_requests_table 
  ON public.service_requests (table_id);

-- 3. Automatic updated_at trigger
CREATE OR REPLACE FUNCTION public.set_service_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_service_requests_updated_at ON public.service_requests;
CREATE TRIGGER trg_service_requests_updated_at
BEFORE UPDATE ON public.service_requests
FOR EACH ROW
EXECUTE FUNCTION public.set_service_requests_updated_at();

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;

-- Staff and Admin RLS Policies
DROP POLICY IF EXISTS "Staff and admins can view service requests" ON public.service_requests;
CREATE POLICY "Staff and admins can view service requests"
  ON public.service_requests
  FOR SELECT
  TO authenticated
  USING (public.is_staff_or_admin());

DROP POLICY IF EXISTS "Staff and admins can update service requests" ON public.service_requests;
CREATE POLICY "Staff and admins can update service requests"
  ON public.service_requests
  FOR UPDATE
  TO authenticated
  USING (public.is_staff_or_admin())
  WITH CHECK (public.is_staff_or_admin());

-- 5. Realtime Publication
ALTER TABLE public.service_requests REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'service_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.service_requests;
  END IF;
END $$;
