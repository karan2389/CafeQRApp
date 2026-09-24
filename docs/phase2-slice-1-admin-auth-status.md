# Phase 2, Slice 1: Admin Authentication & Authorization Status

## Overview
Phase 2 Slice 1 establishes a secure authentication and authorization foundation for administrative access to the Cafe QR Ordering system using Supabase Auth and database-enforced Role-Based Access Control (RBAC).

Anonymous customers have zero administrative access and cannot read, modify, or elevate privileges on administrative records.

---

## Files Changed & Created

### Migrations
- `supabase/migrations/20260923000001_phase2_admin_auth.sql` (NEW): Dedicated migration defining `public.admin_users`, the `trg_admin_users_updated_at` trigger, the `SECURITY DEFINER` `public.is_admin()` function with pinned `search_path`, and hardened RLS policies.

### Server & Client Authentication Utilities
- `lib/auth/admin.ts` (NEW): Reusable server-side authentication and authorization guards (`verifyAdminSession`, `requireAdminApi`) with strong type guarantees and safe error reporting.
- `lib/supabase/client.ts` (MODIFIED): Enhanced `getSupabaseClient()` to initialize via `@supabase/ssr` `createBrowserClient` in browser contexts to ensure cookie persistence across client and server environments.
- `middleware.ts` (MODIFIED): Hardened route matcher and enforcement logic to distinguish between web pages (`/admin/...` -> redirects with contextual error queries) and API endpoints (`/api/admin/...` -> returns HTTP 401/403 JSON payloads).

### Admin Portal & API Handlers
- `app/admin/login/page.tsx` (MODIFIED): Integrated URL query parameter handling for error alerts (`error=forbidden`, `error=session_expired`), dynamic `redirectTo` routing upon successful login, and elimination of synchronous React effect anti-patterns.
- `app/admin/layout.tsx` (MODIFIED): Refined Sign Out flow to terminate client sessions and invoke server-side logout to invalidate auth cookies.
- `app/api/admin/auth/session/route.ts` (NEW): Safe session inspection endpoint returning authenticated status and admin profile details without exposing DB secrets.
- `app/api/admin/auth/logout/route.ts` (NEW): Server-side logout endpoint to terminate Supabase sessions and clear cookies.
- `app/api/admin/upload/route.ts` (MODIFIED): Refactored to use the centralized `requireAdminApi()` guard.
- `app/api/admin/tables/regenerate-token/route.ts` (MODIFIED): Refactored to use the centralized `requireAdminApi()` guard.

### Testing & Verification
- `scripts/verify-admin-auth.ts` (NEW): Comprehensive 9-point unit, mock, and live database security test suite.
- `package.json` (MODIFIED): Registered `test:admin-auth` script.

---

## Migration Details
- **Migration Name**: `20260923000001_phase2_admin_auth.sql`
- **Schema**:
  - `public.admin_users`:
    - `id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE`
    - `email TEXT NOT NULL UNIQUE`
    - `full_name TEXT`
    - `role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin'))`
    - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
    - `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
  - Index: `idx_admin_users_email` on `public.admin_users(email)`
  - Trigger: `trg_admin_users_updated_at` before update to automatically refresh `updated_at`.

---

## Authentication & Authorization Flow

### 1. Admin Sign-In Flow
1. Admin enters credentials (`email`, `password`) on `/admin/login`.
2. Browser client authenticates against Supabase Auth via `supabase.auth.signInWithPassword(...)`.
3. Client stores session tokens in secure browser cookies (managed by `@supabase/ssr`).
4. Client checks `supabase.rpc("is_admin")`. If the user is authenticated but not an admin, client calls `supabase.auth.signOut()` and shows an access-denied error.
5. On successful verification, user is routed to `/admin` or the `redirectTo` destination.

### 2. Server-Side Authorization Verification (`verifyAdminSession`)
1. Server extracts session cookies and calls `supabase.auth.getUser()`.
   - If missing or invalid session -> Returns `{ status: "unauthenticated", user: null, adminUser: null }` (HTTP 401 for APIs).
2. Server executes `supabase.rpc("is_admin")`.
   - If returns `false` -> Returns `{ status: "forbidden_not_admin", user, adminUser: null }` (HTTP 403 for APIs).
3. Server queries `admin_users` directly for the verified `user.id`.
   - If absent -> Returns `{ status: "forbidden_not_admin" }`.
   - If present -> Returns `{ status: "authenticated_admin", user, adminUser }`.

---

## RLS Policies & Function Privileges

### `public.is_admin()` Function
```sql
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
```
- **Privileges**:
  - `REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;`
  - `REVOKE ALL ON FUNCTION public.is_admin() FROM anon;`
  - `GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;`
  - `GRANT EXECUTE ON FUNCTION public.is_admin() TO service_role;`

### `public.admin_users` Table RLS
- **RLS Enabled**: `ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;`
- **SELECT Policy**: `admin_users_select` allows `SELECT` only `TO authenticated USING (public.is_admin())`.
- **UPDATE Policy**: `admin_users_update` allows `UPDATE` only `TO authenticated USING (public.is_admin() AND id = auth.uid()) WITH CHECK (public.is_admin() AND id = auth.uid())`.
- **INSERT / DELETE Policies**: **None for client roles (`anon` or `authenticated`)**. Only `service_role` (e.g., CLI bootstrap scripts or migrations) can create or delete admin accounts.

---

## Security Considerations
1. **No Client Role Trust**: Neither user metadata (`user.user_metadata`) nor client request bodies are trusted. Authorization is determined strictly by the database `admin_users` table and `auth.uid()`.
2. **Search Path Hijacking Prevention**: `is_admin()` explicitly specifies `SET search_path = public, pg_temp`.
3. **No Recursive RLS**: `is_admin()` executes with creator privileges (`SECURITY DEFINER`), avoiding recursive policy evaluations during row filtering.
4. **Zero Anonymous Exposure**: Anonymous users receive 0 rows on querying `admin_users` and cannot call `is_admin()` directly.
5. **No Service-Role Key in Browser**: Client components use strictly `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

---

## Tests Executed & Results

Executed test command:
```bash
npx tsx --env-file=.env scripts/verify-admin-auth.ts
```
**Results (9 / 9 Passed)**:
1. `✓ PASS: Unauthenticated access is cleanly rejected with 'unauthenticated' status`
2. `✓ PASS: Expired session returns safe 'unauthenticated' status`
3. `✓ PASS: Authenticated non-admin is rejected with 'forbidden_not_admin' status`
4. `✓ PASS: Authenticated admin user is granted access with full admin profile`
5. `✓ PASS: Spoofed user metadata/client role is rejected; database is the single source of truth`
6. `✓ PASS: Anonymous SELECT on public.admin_users rejected by database/RLS`
7. `✓ PASS: Attempted self-promotion (INSERT into public.admin_users) blocked by RLS`
8. `✓ PASS: Attempted UPDATE on public.admin_users by anonymous user blocked`
9. `✓ PASS: Calling is_admin() anonymously returns FALSE or fails with permission revoked`

Additional repository tests run:
- `npx tsx scripts/verify-fallback.ts` -> PASSED
- `npx tsx --env-file=.env scripts/verify-supabase.ts` -> PASSED
- `npx tsx --env-file=.env scripts/verify-phase2.ts` -> PASSED

---

## Repository Diagnostics (Typecheck & Lint)
As specified in the task scope, existing unaddressed Phase 2 errors were not hidden:
- **`tsc --noEmit`**: 12 pre-existing errors in unfinished Phase 2 routes (`app/api/admin/tables/close-session/route.ts`, `app/api/orders/route.ts`, `app/qr/route.ts`, `scripts/verify-phase2-integration.spec.ts`).
  - **New files introduced**: 0 TypeScript errors.
- **`eslint .`**: 4 pre-existing warnings/errors (`app/admin/menu/page.tsx`, `app/api/admin/tables/close-session/route.ts`, `app/table/[slug]/page.tsx`).
  - **New files introduced**: 0 ESLint errors.

---

## Required Environment Variables
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase anonymous key for public client and cookie-based SSR.
- `SUPABASE_SERVICE_ROLE_KEY`: Privileged key used solely by backend server scripts (`scripts/bootstrap-admin.ts`) and administrative tasks.

---

## Remaining Phase 2 Work (Out of Scope for Slice 1)
- **Slice 2**: Secure Table QR Token Generation, Provisioning, and Resolution RPC.
- **Slice 3**: Customer Scan Sessions & Table Order Sessions.
- **Slice 4**: Secure Server-Side Order Submission, Validation, and Historical Snapshots.
- **Slice 5**: Cloudflare R2 Image Deletion Lifecycle & Queue Processing.
