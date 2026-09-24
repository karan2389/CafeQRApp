-- =============================================================================
-- Cafe QR Ordering System: Phase 2 Migration & Seed Script
-- Safe to run in Supabase SQL Editor
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. Admin Users Table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 2. Security Definer Helper: public.is_admin()
-- -----------------------------------------------------------------------------
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

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO service_role;

-- -----------------------------------------------------------------------------
-- 3. Isolated Table QR Tokens
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.table_qr_tokens (
  table_id UUID PRIMARY KEY REFERENCES public.tables(id) ON DELETE CASCADE,
  qr_token_hash TEXT NOT NULL UNIQUE,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_table_qr_tokens_hash ON public.table_qr_tokens (qr_token_hash);

-- -----------------------------------------------------------------------------
-- 4. Two-Level Session Architecture
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.table_order_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id UUID NOT NULL REFERENCES public.tables(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CLOSED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_active_table_order_session 
ON public.table_order_sessions (table_id) 
WHERE (status = 'ACTIVE');

CREATE INDEX IF NOT EXISTS idx_table_order_sessions_table ON public.table_order_sessions(table_id);

CREATE TABLE IF NOT EXISTS public.customer_scan_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_order_session_id UUID NOT NULL REFERENCES public.table_order_sessions(id) ON DELETE CASCADE,
  session_token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '12 hours')
);

CREATE INDEX IF NOT EXISTS idx_customer_scan_sessions_hash ON public.customer_scan_sessions(session_token_hash);
CREATE INDEX IF NOT EXISTS idx_customer_scan_sessions_parent ON public.customer_scan_sessions(table_order_session_id);

-- -----------------------------------------------------------------------------
-- 5. Enable Row Level Security (RLS) on All Tables
-- -----------------------------------------------------------------------------
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.table_qr_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.table_order_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_scan_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 6. RLS Policies
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "admin_users_select" ON public.admin_users;
CREATE POLICY "admin_users_select"
ON public.admin_users
FOR SELECT
TO authenticated
USING (public.is_admin());

DROP POLICY IF EXISTS "admin_manage_table_qr_tokens" ON public.table_qr_tokens;
CREATE POLICY "admin_manage_table_qr_tokens"
ON public.table_qr_tokens
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

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

DROP POLICY IF EXISTS "admin_all_table_order_sessions" ON public.table_order_sessions;
CREATE POLICY "admin_all_table_order_sessions"
ON public.table_order_sessions
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_all_customer_scan_sessions" ON public.customer_scan_sessions;
CREATE POLICY "admin_all_customer_scan_sessions"
ON public.customer_scan_sessions
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- -----------------------------------------------------------------------------
-- 7. Seed Initial QR Tokens for Existing Tables (Tables 1 to 6)
-- Token hash is sha256(table_number || '_cafe_qr_token_' || table_id)
-- -----------------------------------------------------------------------------
INSERT INTO public.table_qr_tokens (table_id, qr_token_hash, generated_at)
SELECT 
  t.id AS table_id,
  encode(digest(t.table_number::text || '_cafe_qr_seed_token_2026', 'sha256'), 'hex') AS qr_token_hash,
  NOW() AS generated_at
FROM public.tables t
ON CONFLICT (table_id) DO NOTHING;
