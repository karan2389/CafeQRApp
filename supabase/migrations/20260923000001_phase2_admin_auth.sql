-- ==============================================================================
-- Migration: 20260923000001_phase2_admin_auth.sql
-- Description: Phase 2 Slice 1 - Dedicated Admin Authentication and Authorization.
--              Hardened admin_users schema, updated_at trigger, search_path-pinned
--              SECURITY DEFINER is_admin() function, and strict non-recursive RLS.
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ------------------------------------------------------------------------------
-- 1. Admin Users Table
-- References auth.users(id). Single full-access 'admin' role initially.
-- Prevents duplicate user associations via UUID primary key referencing auth.users.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for email lookups
CREATE INDEX IF NOT EXISTS idx_admin_users_email ON public.admin_users (email);

-- ------------------------------------------------------------------------------
-- 2. Updated At Trigger Function
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_admin_updated_at()
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

DROP TRIGGER IF EXISTS trg_admin_users_updated_at ON public.admin_users;
CREATE TRIGGER trg_admin_users_updated_at
BEFORE UPDATE ON public.admin_users
FOR EACH ROW
EXECUTE FUNCTION public.handle_admin_updated_at();

-- ------------------------------------------------------------------------------
-- 3. Security Definer Helper: public.is_admin()
-- Pinned search_path prevents search_path hijacking.
-- Avoids recursive RLS evaluation by executing with creator privileges.
-- Returns FALSE for anonymous / unauthenticated users immediately.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
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
        FROM public.admin_users 
        WHERE id = auth.uid()
      )
    ),
    FALSE
  );
$$;

-- Revoke default public/anon execution, grant strictly to authenticated and service_role
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO service_role;

-- ------------------------------------------------------------------------------
-- 4. Enable and Harden Row Level Security (RLS) on public.admin_users
-- ------------------------------------------------------------------------------
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- A. SELECT: Authenticated admins can view admin user records
DROP POLICY IF EXISTS "admin_users_select" ON public.admin_users;
CREATE POLICY "admin_users_select"
ON public.admin_users
FOR SELECT
TO authenticated
USING (public.is_admin());

-- B. UPDATE: Authenticated admins can only update their own record
DROP POLICY IF EXISTS "admin_users_update" ON public.admin_users;
CREATE POLICY "admin_users_update"
ON public.admin_users
FOR UPDATE
TO authenticated
USING (public.is_admin() AND id = auth.uid())
WITH CHECK (public.is_admin() AND id = auth.uid());

-- C. INSERT / DELETE: NO POLICY for authenticated or anon.
-- This ensures self-promotion is impossible through client APIs.
-- Admin user records can ONLY be provisioned by service_role (e.g. bootstrap script)
-- or superuser database migrations.
DROP POLICY IF EXISTS "admin_users_insert_blocked" ON public.admin_users;
DROP POLICY IF EXISTS "admin_users_delete_blocked" ON public.admin_users;
