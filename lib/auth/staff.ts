import { NextResponse } from "next/server";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database, DbStaffUser } from "@/types/database";

export type StaffAuthStatus =
  | "authenticated_staff"
  | "unauthenticated"
  | "forbidden_not_staff";

export type StaffAuthResult =
  | {
      status: "authenticated_staff";
      user: User;
      staffUser: DbStaffUser | null;
      role: "kitchen_staff" | "admin";
      supabase: SupabaseClient<Database>;
    }
  | {
      status: "unauthenticated";
      user: null;
      staffUser: null;
      error: string;
      supabase: SupabaseClient<Database>;
    }
  | {
      status: "forbidden_not_staff";
      user: User;
      staffUser: null;
      error: string;
      supabase: SupabaseClient<Database>;
    };

export type RequireStaffApiResult =
  | {
      authorized: true;
      user: User;
      staffUser: DbStaffUser | null;
      role: "kitchen_staff" | "admin";
      supabase: SupabaseClient<Database>;
    }
  | {
      authorized: false;
      response: NextResponse;
    };

/**
 * Server-side kitchen staff verification mechanism.
 * Authenticates user session through Supabase Auth cookies and checks
 * authorization against public.staff_users and the is_staff() database function.
 *
 * Deliberate Admin Access:
 * If an active administrator accesses a kitchen route, access is also permitted
 * with role: 'admin' to enable cafe managers to oversee kitchen operations.
 *
 * Distinguishes:
 * 1. Unauthenticated user (no valid session) -> status: "unauthenticated"
 * 2. Authenticated user without staff authorization -> status: "forbidden_not_staff"
 * 3. Authenticated kitchen staff or admin -> status: "authenticated_staff"
 *
 * Never trusts client-provided role parameters or local storage.
 */
export async function verifyStaffSession(
  existingClient?: SupabaseClient<Database>
): Promise<StaffAuthResult> {
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
        staffUser: null,
        error: "Authentication required",
        supabase,
      };
    }

    // 2. Check active kitchen staff authorization via security-definer is_staff()
    const { data: isStaff, error: staffRpcError } = await supabase.rpc("is_staff");

    if (!staffRpcError && isStaff) {
      const { data: staffRecord, error: staffRecordError } = await supabase
        .from("staff_users")
        .select("*")
        .eq("id", user.id)
        .eq("is_active", true)
        .maybeSingle();

      if (!staffRecordError && staffRecord) {
        return {
          status: "authenticated_staff",
          user,
          staffUser: staffRecord,
          role: "kitchen_staff",
          supabase,
        };
      }
    }

    // 3. Deliberate Admin Fallback: allow active administrators to oversee kitchen
    const { data: isAdmin, error: adminRpcError } = await supabase.rpc("is_admin");

    if (!adminRpcError && isAdmin) {
      return {
        status: "authenticated_staff",
        user,
        staffUser: null,
        role: "admin",
        supabase,
      };
    }

    // 4. Authenticated user has neither active staff nor admin authorization
    return {
      status: "forbidden_not_staff",
      user,
      staffUser: null,
      error: "Staff authorization required",
      supabase,
    };
  } catch (err: unknown) {
    console.error("[StaffAuth] Verification exception:", err);
    return {
      status: "unauthenticated",
      user: null,
      staffUser: null,
      error: "Authentication verification failed",
      supabase,
    };
  }
}

/**
 * Reusable server-side guard for Kitchen Staff API Route Handlers.
 * Returns either authorized credentials and Supabase client, or a pre-formatted
 * safe NextResponse (401 Unauthorized or 403 Forbidden).
 */
export async function requireStaffApi(): Promise<RequireStaffApiResult> {
  const result = await verifyStaffSession();

  if (result.status === "unauthenticated") {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: "Unauthorized", message: result.error },
        { status: 401 }
      ),
    };
  }

  if (result.status === "forbidden_not_staff") {
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
    staffUser: result.staffUser,
    role: result.role,
    supabase: result.supabase,
  };
}
