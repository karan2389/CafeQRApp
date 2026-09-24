import { NextResponse } from "next/server";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database, DbAdminUser } from "@/types/database";

export type AdminAuthStatus =
  | "authenticated_admin"
  | "unauthenticated"
  | "forbidden_not_admin";

export type AdminAuthResult =
  | {
      status: "authenticated_admin";
      user: User;
      adminUser: DbAdminUser;
      supabase: SupabaseClient<Database>;
    }
  | {
      status: "unauthenticated";
      user: null;
      adminUser: null;
      error: string;
      supabase: SupabaseClient<Database>;
    }
  | {
      status: "forbidden_not_admin";
      user: User;
      adminUser: null;
      error: string;
      supabase: SupabaseClient<Database>;
    };

export type RequireAdminApiResult =
  | {
      authorized: true;
      user: User;
      adminUser: DbAdminUser;
      supabase: SupabaseClient<Database>;
    }
  | {
      authorized: false;
      response: NextResponse;
    };

/**
 * Server-side admin verification mechanism.
 * Authenticates the user session through Supabase Auth cookies and checks
 * authorization against public.admin_users and the is_admin() database function.
 *
 * Distinguishes:
 * 1. Unauthenticated user (no valid session)
 * 2. Authenticated non-admin user (valid user, but not in admin_users)
 * 3. Authenticated admin user (valid user present in admin_users with role 'admin')
 *
 * Never trusts client-provided role parameters or local storage.
 */
export async function verifyAdminSession(
  existingClient?: SupabaseClient<Database>
): Promise<AdminAuthResult> {
  const supabase = existingClient ?? (await createClient());

  try {
    // 1. Authenticate user from secure server-side session cookies
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return {
        status: "unauthenticated",
        user: null,
        adminUser: null,
        error: "Authentication required",
        supabase,
      };
    }

    // 2. Verify authorization via security-definer is_admin() function
    const { data: isAdmin, error: rpcError } = await supabase.rpc("is_admin");

    if (rpcError || !isAdmin) {
      return {
        status: "forbidden_not_admin",
        user,
        adminUser: null,
        error: "Administrator privileges required",
        supabase,
      };
    }

    // 3. Fetch admin profile details directly from protected admin_users table
    const { data: adminRecord, error: profileError } = await supabase
      .from("admin_users")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !adminRecord) {
      return {
        status: "forbidden_not_admin",
        user,
        adminUser: null,
        error: "Administrator privileges required",
        supabase,
      };
    }

    return {
      status: "authenticated_admin",
      user,
      adminUser: adminRecord,
      supabase,
    };
  } catch (err: unknown) {
    console.error("[AdminAuth] Verification exception:", err);
    return {
      status: "unauthenticated",
      user: null,
      adminUser: null,
      error: "Authentication verification failed",
      supabase,
    };
  }
}

/**
 * Reusable server-side guard for API Route Handlers.
 * Returns either authorized credentials and Supabase client, or a pre-formatted
 * safe NextResponse (401 Unauthorized or 403 Forbidden).
 */
export async function requireAdminApi(): Promise<RequireAdminApiResult> {
  const result = await verifyAdminSession();

  if (result.status === "unauthenticated") {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: "Unauthorized", message: result.error },
        { status: 401 }
      ),
    };
  }

  if (result.status === "forbidden_not_admin") {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: "Forbidden", message: result.error },
        { status: 403 }
      ),
    };
  }

  return {
    authorized: true,
    user: result.user,
    adminUser: result.adminUser,
    supabase: result.supabase,
  };
}
