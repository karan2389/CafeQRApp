-- ==============================================================================
-- Migration: 20260925000001_phase1_kitchen_staff.sql
-- Description: Phase 1 - Kitchen Staff Account and Authentication Foundation.
--              Creates staff_users table, indexes, updated_at trigger,
--              SECURITY DEFINER is_staff() and is_staff_or_admin() helper functions,
--              and strict Row Level Security (RLS) policies.
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ------------------------------------------------------------------------------
-- 1. Staff Users Table
-- References auth.users(id). Single full-access 'kitchen_staff' role initially.
-- Prevents duplicate user associations via UUID primary key referencing auth.users.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.staff_users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'kitchen_staff' CHECK (role IN ('kitchen_staff')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_staff_users_email ON public.staff_users (email);
CREATE INDEX IF NOT EXISTS idx_staff_users_active ON public.staff_users (is_active);

-- ------------------------------------------------------------------------------
-- 2. Updated At Trigger Function
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_staff_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_staff_users_updated_at ON public.staff_users;
CREATE TRIGGER trg_staff_users_updated_at
BEFORE UPDATE ON public.staff_users
FOR EACH ROW
EXECUTE FUNCTION public.handle_staff_updated_at();

-- ------------------------------------------------------------------------------
-- 3. Security Definer Helper: public.is_staff()
-- Pinned search_path prevents search_path hijacking.
-- Avoids recursive RLS evaluation by executing with creator privileges.
-- Returns FALSE for anonymous / unauthenticated users immediately.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (
      SELECT EXISTS (
        SELECT 1 
        FROM public.staff_users 
        WHERE id = auth.uid()
          AND is_active = true
      )
    ),
    FALSE
  );
$$;

-- Revoke default public/anon execution, grant strictly to authenticated and service_role
REVOKE ALL ON FUNCTION public.is_staff() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_staff() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff() TO service_role;

-- ------------------------------------------------------------------------------
-- 4. Security Definer Helper: public.is_staff_or_admin()
-- Returns TRUE if user is either an active kitchen_staff OR an active admin.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_staff_or_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.is_staff() OR public.is_admin();
$$;

REVOKE ALL ON FUNCTION public.is_staff_or_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_staff_or_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_staff_or_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff_or_admin() TO service_role;

-- ------------------------------------------------------------------------------
-- 5. Enable and Harden Row Level Security (RLS) on public.staff_users
-- ------------------------------------------------------------------------------
ALTER TABLE public.staff_users ENABLE ROW LEVEL SECURITY;

-- A. SELECT: Authenticated admins can view all staff records; staff can view their own record
DROP POLICY IF EXISTS "staff_users_select" ON public.staff_users;
CREATE POLICY "staff_users_select"
ON public.staff_users
FOR SELECT
TO authenticated
USING (public.is_admin() OR (auth.uid() = id AND is_active = true));

-- B. UPDATE: Authenticated admins can update staff records
DROP POLICY IF EXISTS "staff_users_update_admin" ON public.staff_users;
CREATE POLICY "staff_users_update_admin"
ON public.staff_users
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- C. INSERT / DELETE: NO POLICY for authenticated or anon.
-- Staff user records can ONLY be provisioned by service_role (e.g. admin API or bootstrap script)
-- or superuser database migrations.
DROP POLICY IF EXISTS "staff_users_insert_blocked" ON public.staff_users;
DROP POLICY IF EXISTS "staff_users_delete_blocked" ON public.staff_users;
