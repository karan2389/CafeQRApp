-- ==============================================================================
-- Migration: Phase 8 - Table Session Closure & Billing Controls
-- ==============================================================================

-- 1. Extend table_order_sessions with closure and payment confirmation audit fields
ALTER TABLE public.table_order_sessions
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_confirmed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'CASH' CHECK (payment_method IN ('CASH', 'CARD', 'UPI', 'OTHER')),
  ADD COLUMN IF NOT EXISTS final_bill_amount_inr NUMERIC(10, 2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS final_bill_amount_paise BIGINT DEFAULT 0;

-- 2. Add performance indexes for session lookups and status
CREATE INDEX IF NOT EXISTS idx_table_order_sessions_status 
  ON public.table_order_sessions(status);

CREATE INDEX IF NOT EXISTS idx_table_order_sessions_table_status 
  ON public.table_order_sessions(table_id, status);

CREATE INDEX IF NOT EXISTS idx_orders_session_status 
  ON public.orders(table_order_session_id, status);

-- 3. RLS policies for staff access on table_order_sessions
DROP POLICY IF EXISTS "staff_select_table_order_sessions" ON public.table_order_sessions;
CREATE POLICY "staff_select_table_order_sessions"
  ON public.table_order_sessions
  FOR SELECT
  TO authenticated
  USING (public.is_staff() OR public.is_admin());

DROP POLICY IF EXISTS "staff_update_table_order_sessions" ON public.table_order_sessions;
CREATE POLICY "staff_update_table_order_sessions"
  ON public.table_order_sessions
  FOR UPDATE
  TO authenticated
  USING (public.is_staff() OR public.is_admin())
  WITH CHECK (public.is_staff() OR public.is_admin());

-- 4. Atomic PostgreSQL Function: close_table_session
CREATE OR REPLACE FUNCTION public.close_table_session(
  p_session_id UUID,
  p_staff_user_id UUID DEFAULT NULL,
  p_payment_method TEXT DEFAULT 'CASH',
  p_force BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session RECORD;
  v_unfinished_count INT := 0;
  v_total_inr NUMERIC(10, 2) := 0.00;
  v_total_paise BIGINT := 0;
  v_total_orders INT := 0;
  v_delivered_orders INT := 0;
  v_cancelled_orders INT := 0;
  v_now TIMESTAMPTZ := NOW();
  v_method TEXT;
BEGIN
  -- Validate payment method
  v_method := UPPER(COALESCE(p_payment_method, 'CASH'));
  IF v_method NOT IN ('CASH', 'CARD', 'UPI', 'OTHER') THEN
    v_method := 'CASH';
  END IF;

  -- 1. Lock and fetch table order session
  SELECT * INTO v_session
  FROM public.table_order_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'SESSION_NOT_FOUND',
      'message', 'Table order session not found.'
    );
  END IF;

  -- 2. Concurrency check: already closed
  IF v_session.status = 'CLOSED' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'SESSION_ALREADY_CLOSED',
      'message', 'This table session has already been closed.',
      'session_id', v_session.id,
      'closed_at', v_session.closed_at,
      'final_bill_amount_inr', v_session.final_bill_amount_inr,
      'final_bill_amount_paise', v_session.final_bill_amount_paise
    );
  END IF;

  -- 3. Check for unfinished orders (PENDING, NEW, PREPARING)
  SELECT COUNT(*) INTO v_unfinished_count
  FROM public.orders
  WHERE table_order_session_id = p_session_id
    AND status IN ('PENDING', 'NEW', 'PREPARING');

  IF v_unfinished_count > 0 AND NOT p_force THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'SESSION_HAS_UNFINISHED_ORDERS',
      'message', format('Table session has %s unfinished kitchen order(s). Please resolve them before closing or confirm with override.', v_unfinished_count),
      'unfinished_count', v_unfinished_count
    );
  END IF;

  -- 4. Compute final bill from non-cancelled orders
  SELECT 
    COALESCE(SUM(total_amount_inr), 0.00),
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'DELIVERED'),
    COUNT(*) FILTER (WHERE status = 'CANCELLED')
  INTO 
    v_total_inr,
    v_total_orders,
    v_delivered_orders,
    v_cancelled_orders
  FROM public.orders
  WHERE table_order_session_id = p_session_id
    AND status != 'CANCELLED';

  v_total_paise := ROUND(v_total_inr * 100);

  -- 5. Atomically update session to CLOSED
  UPDATE public.table_order_sessions
  SET 
    status = 'CLOSED',
    closed_at = v_now,
    closed_by = p_staff_user_id,
    payment_confirmed_at = v_now,
    payment_confirmed_by = p_staff_user_id,
    payment_method = v_method,
    final_bill_amount_inr = v_total_inr,
    final_bill_amount_paise = v_total_paise
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'status', 'CLOSED',
    'closed_at', v_now,
    'closed_by', p_staff_user_id,
    'payment_confirmed_at', v_now,
    'payment_confirmed_by', p_staff_user_id,
    'payment_method', v_method,
    'final_bill_amount_inr', v_total_inr,
    'final_bill_amount_paise', v_total_paise,
    'total_orders', v_total_orders,
    'delivered_orders', v_delivered_orders,
    'cancelled_orders', v_cancelled_orders
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.close_table_session(UUID, UUID, TEXT, BOOLEAN) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.close_table_session(UUID, UUID, TEXT, BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION public.close_table_session(UUID, UUID, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_table_session(UUID, UUID, TEXT, BOOLEAN) TO service_role;
