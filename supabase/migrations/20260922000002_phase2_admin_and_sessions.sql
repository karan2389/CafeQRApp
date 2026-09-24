-- ==============================================================================
-- Migration: 20260922000002_phase2_admin_and_sessions.sql
-- Description: Phase 2 Admin Users, Security Definer Helper, QR Tokens, 
--              Two-Level Order & Scan Sessions, and Hardened RLS Policies.
--              Includes Orders, R2 Deletion Queue, and Atomic RPCs.
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ------------------------------------------------------------------------------
-- 1. Admin Users Table
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 2. Security Definer Helper: public.is_admin()
-- Avoids recursive RLS evaluation by executing with creator privileges and
-- explicitly pinning the search path to prevent search_path hijacking.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.admin_users 
    WHERE id = auth.uid()
  );
$$;

-- Revoke default public execution, grant only to authenticated and service_role
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO service_role;

-- ------------------------------------------------------------------------------
-- 3. Isolated Table QR Tokens (Zero Column Leakage from public.tables)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.table_qr_tokens (
  table_id UUID PRIMARY KEY REFERENCES public.tables(id) ON DELETE CASCADE,
  qr_token_hash TEXT NOT NULL UNIQUE,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_table_qr_tokens_hash ON public.table_qr_tokens (qr_token_hash);

-- ------------------------------------------------------------------------------
-- 4. Two-Level Session Architecture & Orders
-- ------------------------------------------------------------------------------

-- Level A: Table Order Sessions (Shared Bill for the Physical Table)
CREATE TABLE IF NOT EXISTS public.table_order_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id UUID NOT NULL REFERENCES public.tables(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CLOSED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

-- Enforce strictly ONE active session per physical table
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_table_order_session 
ON public.table_order_sessions (table_id) 
WHERE (status = 'ACTIVE');

CREATE INDEX IF NOT EXISTS idx_table_order_sessions_table ON public.table_order_sessions(table_id);

-- Level B: Customer Scan Sessions (Individual Device Scan Session)
CREATE TABLE IF NOT EXISTS public.customer_scan_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_order_session_id UUID NOT NULL REFERENCES public.table_order_sessions(id) ON DELETE CASCADE,
  session_token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '12 hours')
);

CREATE INDEX IF NOT EXISTS idx_customer_scan_sessions_hash ON public.customer_scan_sessions(session_token_hash);
CREATE INDEX IF NOT EXISTS idx_customer_scan_sessions_parent ON public.customer_scan_sessions(table_order_session_id);

-- Orders Table
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_order_session_id UUID NOT NULL REFERENCES public.table_order_sessions(id) ON DELETE CASCADE,
    table_id UUID NOT NULL REFERENCES public.tables(id) ON DELETE CASCADE,
    customer_scan_session_id UUID NOT NULL REFERENCES public.customer_scan_sessions(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PREPARING', 'DELIVERED', 'PAID', 'CANCELLED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Order Items Table
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
-- 5. R2 Deletion Queue (Garbage Collection)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.r2_deletion_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_key TEXT NOT NULL,
  status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'FAILED', 'COMPLETED')),
  attempts INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION enqueue_r2_deletion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.image_url IS NOT NULL THEN
    INSERT INTO public.r2_deletion_queue (object_key) VALUES (OLD.image_url);
  ELSIF TG_OP = 'UPDATE' AND OLD.image_url IS NOT NULL AND OLD.image_url != NEW.image_url THEN
    INSERT INTO public.r2_deletion_queue (object_key) VALUES (OLD.image_url);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS menu_item_r2_cleanup ON public.menu_items;
CREATE TRIGGER menu_item_r2_cleanup
AFTER UPDATE OR DELETE ON public.menu_items
FOR EACH ROW EXECUTE FUNCTION enqueue_r2_deletion();

-- ------------------------------------------------------------------------------
-- 6. Enable Row Level Security (RLS) on All Tables
-- ------------------------------------------------------------------------------
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.table_qr_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.table_order_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_scan_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.r2_deletion_queue ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 7. Row Level Security Policies
-- ------------------------------------------------------------------------------

-- A. admin_users
DROP POLICY IF EXISTS "admin_users_select" ON public.admin_users;
CREATE POLICY "admin_users_select"
ON public.admin_users
FOR SELECT
TO authenticated
USING (public.is_admin());

-- B. table_qr_tokens (PROTECT QR HASHES - NO PUBLIC ACCESS)
DROP POLICY IF EXISTS "admin_manage_table_qr_tokens" ON public.table_qr_tokens;
CREATE POLICY "admin_manage_table_qr_tokens"
ON public.table_qr_tokens
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- C. tables
DROP POLICY IF EXISTS "Allow public read-only access on active tables" ON public.tables;
DROP POLICY IF EXISTS "public_read_active_tables" ON public.tables;
CREATE POLICY "public_read_active_tables"
ON public.tables
FOR SELECT
TO anon, authenticated
USING (is_active = true);

DROP POLICY IF EXISTS "admin_all_tables" ON public.tables;
CREATE POLICY "admin_all_tables"
ON public.tables
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- D. menu_categories
DROP POLICY IF EXISTS "Allow public read-only access on active categories" ON public.menu_categories;
DROP POLICY IF EXISTS "public_read_active_categories" ON public.menu_categories;
CREATE POLICY "public_read_active_categories"
ON public.menu_categories
FOR SELECT
TO anon, authenticated
USING (is_active = true);

DROP POLICY IF EXISTS "admin_all_menu_categories" ON public.menu_categories;
CREATE POLICY "admin_all_menu_categories"
ON public.menu_categories
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- E. menu_items
DROP POLICY IF EXISTS "Allow public read-only access on available menu items" ON public.menu_items;
DROP POLICY IF EXISTS "public_read_available_menu_items" ON public.menu_items;
CREATE POLICY "public_read_available_menu_items"
ON public.menu_items
FOR SELECT
TO anon, authenticated
USING (is_available = true);

DROP POLICY IF EXISTS "admin_all_menu_items" ON public.menu_items;
CREATE POLICY "admin_all_menu_items"
ON public.menu_items
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- F. branches
DROP POLICY IF EXISTS "Allow public read-only access on branches" ON public.branches;
DROP POLICY IF EXISTS "public_read_branches" ON public.branches;
CREATE POLICY "public_read_branches"
ON public.branches
FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "admin_all_branches" ON public.branches;
CREATE POLICY "admin_all_branches"
ON public.branches
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- G. table_order_sessions
DROP POLICY IF EXISTS "admin_all_table_order_sessions" ON public.table_order_sessions;
CREATE POLICY "admin_all_table_order_sessions"
ON public.table_order_sessions
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- H. customer_scan_sessions
DROP POLICY IF EXISTS "admin_all_customer_scan_sessions" ON public.customer_scan_sessions;
CREATE POLICY "admin_all_customer_scan_sessions"
ON public.customer_scan_sessions
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- I. orders
DROP POLICY IF EXISTS "admin_all_orders" ON public.orders;
CREATE POLICY "admin_all_orders"
ON public.orders
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- J. order_items
DROP POLICY IF EXISTS "admin_all_order_items" ON public.order_items;
CREATE POLICY "admin_all_order_items"
ON public.order_items
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- K. r2_deletion_queue
DROP POLICY IF EXISTS "admin_all_r2_deletion_queue" ON public.r2_deletion_queue;
CREATE POLICY "admin_all_r2_deletion_queue"
ON public.r2_deletion_queue
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());


-- ------------------------------------------------------------------------------
-- 8. Atomic RPCs
-- ------------------------------------------------------------------------------

-- 8.1. Resolve QR Scan
CREATE OR REPLACE FUNCTION public.resolve_qr_scan(
  p_qr_token_hash TEXT,
  p_customer_token_hash TEXT
)
RETURNS TABLE (
  table_id UUID,
  table_number INT,
  table_slug TEXT,
  table_order_session_id UUID,
  customer_scan_session_id UUID,
  expires_at TIMESTAMPTZ,
  is_new_order_session BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_table_id UUID;
  v_table_num INT;
  v_table_slug TEXT;
  v_is_active BOOLEAN;
  v_order_session_id UUID;
  v_scan_session_id UUID;
  v_expires_at TIMESTAMPTZ;
  v_is_new BOOLEAN := FALSE;
BEGIN
  SELECT t.id, t.table_number, ('table-' || t.table_number::text), t.is_active
  INTO v_table_id, v_table_num, v_table_slug, v_is_active
  FROM public.table_qr_tokens q
  JOIN public.tables t ON t.id = q.table_id
  WHERE q.qr_token_hash = p_qr_token_hash;

  IF v_table_id IS NULL OR NOT v_is_active THEN
    RETURN;
  END IF;

  PERFORM 1 FROM public.tables WHERE id = v_table_id FOR UPDATE;

  SELECT id INTO v_order_session_id
  FROM public.table_order_sessions
  WHERE public.table_order_sessions.table_id = v_table_id AND status = 'ACTIVE'
  LIMIT 1;

  IF v_order_session_id IS NULL THEN
    INSERT INTO public.table_order_sessions (table_id, status)
    VALUES (v_table_id, 'ACTIVE')
    RETURNING id INTO v_order_session_id;
    v_is_new := TRUE;
  END IF;

  v_expires_at := NOW() + INTERVAL '12 hours';

  INSERT INTO public.customer_scan_sessions (
    table_order_session_id,
    session_token_hash,
    expires_at
  )
  VALUES (
    v_order_session_id,
    p_customer_token_hash,
    v_expires_at
  )
  RETURNING id INTO v_scan_session_id;

  RETURN QUERY SELECT 
    v_table_id, 
    v_table_num, 
    v_table_slug, 
    v_order_session_id, 
    v_scan_session_id, 
    v_expires_at, 
    v_is_new;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_qr_scan(TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.resolve_qr_scan(TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.resolve_qr_scan(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_qr_scan(TEXT, TEXT) TO service_role;

-- 8.2. Provision Table
CREATE OR REPLACE FUNCTION public.provision_table(
  p_branch_id UUID,
  p_table_number INT,
  p_qr_token_hash TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_table_id UUID;
BEGIN
  INSERT INTO public.tables (branch_id, table_number, is_active)
  VALUES (p_branch_id, p_table_number, true)
  RETURNING id INTO v_table_id;

  INSERT INTO public.table_qr_tokens (table_id, qr_token_hash)
  VALUES (v_table_id, p_qr_token_hash);

  RETURN v_table_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.provision_table(UUID, INT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.provision_table(UUID, INT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.provision_table(UUID, INT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.provision_table(UUID, INT, TEXT) TO service_role;

-- 8.3. Submit Table Order
CREATE OR REPLACE FUNCTION public.submit_table_order(
  p_scan_session_id UUID,
  p_items JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order_session_id UUID;
  v_table_id UUID;
  v_order_id UUID;
  v_item RECORD;
BEGIN
  SELECT tos.id, tos.table_id
  INTO v_order_session_id, v_table_id
  FROM public.customer_scan_sessions css
  JOIN public.table_order_sessions tos ON tos.id = css.table_order_session_id
  WHERE css.id = p_scan_session_id
    AND css.expires_at > NOW()
    AND tos.status = 'ACTIVE'
  FOR UPDATE OF tos;

  IF v_order_session_id IS NULL THEN
    RAISE EXCEPTION 'Invalid, expired, or closed session';
  END IF;

  INSERT INTO public.orders (table_order_session_id, table_id, customer_scan_session_id, status)
  VALUES (v_order_session_id, v_table_id, p_scan_session_id, 'PENDING')
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(menu_item_id UUID, quantity INT, customization TEXT)
  LOOP
    INSERT INTO public.order_items (order_id, menu_item_id, item_name, unit_price_inr, quantity, customization_notes)
    SELECT v_order_id, mi.id, mi.name, mi.price, v_item.quantity, v_item.customization
    FROM public.menu_items mi
    WHERE mi.id = v_item.menu_item_id;
  END LOOP;

  RETURN v_order_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_table_order(UUID, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.submit_table_order(UUID, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_table_order(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_table_order(UUID, JSONB) TO service_role;

-- 8.4. Close Table Session
CREATE OR REPLACE FUNCTION public.close_table_session(p_table_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session_id UUID;
  v_unpaid_count INT;
BEGIN
  SELECT id INTO v_session_id
  FROM public.table_order_sessions
  WHERE table_id = p_table_id AND status = 'ACTIVE'
  FOR UPDATE;

  IF v_session_id IS NULL THEN RETURN FALSE; END IF;

  SELECT COUNT(*) INTO v_unpaid_count
  FROM public.orders
  WHERE table_order_session_id = v_session_id AND status NOT IN ('PAID', 'CANCELLED');

  IF v_unpaid_count > 0 THEN
    RAISE EXCEPTION 'Cannot close session with unpaid orders';
  END IF;

  UPDATE public.table_order_sessions
  SET status = 'CLOSED', closed_at = NOW()
  WHERE id = v_session_id;

  RETURN TRUE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.close_table_session(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.close_table_session(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.close_table_session(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_table_session(UUID) TO service_role;

-- 8.5. Claim R2 Deletion Batch
CREATE OR REPLACE FUNCTION public.claim_r2_deletion_batch(p_batch_size INT)
RETURNS TABLE(id UUID, object_key TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.r2_deletion_queue
  SET status = 'PROCESSING', updated_at = NOW(), attempts = attempts + 1
  WHERE id IN (
    SELECT q.id FROM public.r2_deletion_queue q
    WHERE q.status IN ('PENDING', 'FAILED') 
      AND q.attempts < 3
      AND (q.status = 'PENDING' OR (q.status = 'FAILED' AND q.updated_at < NOW() - INTERVAL '5 minutes'))
    ORDER BY created_at ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  RETURNING public.r2_deletion_queue.id, public.r2_deletion_queue.object_key;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_r2_deletion_batch(INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_r2_deletion_batch(INT) FROM anon;
GRANT EXECUTE ON FUNCTION public.claim_r2_deletion_batch(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_r2_deletion_batch(INT) TO service_role;
