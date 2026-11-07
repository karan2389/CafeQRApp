import { verifyStaffSession } from "../lib/auth/staff";
import { verifyAdminSession } from "../lib/auth/admin";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database, DbStaffUser } from "../types/database";
import * as fs from "fs";
import * as path from "path";

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passedCount++;
  } else {
    console.error(`  ✗ FAIL: ${testName} ${detail ? `(${detail})` : ""}`);
    failedCount++;
  }
}

async function runUnitAndMockTests() {
  console.log("\n--- Part 1: Staff Authorization Unit & Logic Tests ---");

  // Mock 1: Unauthenticated user (no session)
  const mockUnauthenticatedClient = {
    auth: {
      getUser: async () => ({
        data: { user: null },
        error: { message: "Auth session missing", name: "AuthSessionMissingError" },
      }),
    },
  } as unknown as SupabaseClient<Database>;

  const unauthResult = await verifyStaffSession(mockUnauthenticatedClient);
  assert(
    unauthResult.status === "unauthenticated" && unauthResult.user === null,
    "1. Unauthenticated access is cleanly rejected with 'unauthenticated' status (triggers redirect to /staff/login)"
  );

  // Mock 2: Expired session
  const mockExpiredClient = {
    auth: {
      getUser: async () => ({
        data: { user: null },
        error: { message: "JWT expired", name: "AuthApiError" },
      }),
    },
  } as unknown as SupabaseClient<Database>;

  const expiredResult = await verifyStaffSession(mockExpiredClient);
  assert(
    expiredResult.status === "unauthenticated" && expiredResult.error === "Authentication required",
    "2. Expired session returns safe 'unauthenticated' status"
  );

  // Mock 3: Authenticated non-staff user (customer without staff record)
  const customerUser: User = {
    id: "33333333-3333-3333-3333-333333333333",
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: new Date().toISOString(),
    email: "customer@example.com",
  };

  const mockNonStaffClient = {
    auth: {
      getUser: async () => ({ data: { user: customerUser }, error: null }),
    },
    rpc: async (fn: string) => {
      if (fn === "is_staff") return { data: false, error: null };
      if (fn === "is_admin") return { data: false, error: null };
      return { data: null, error: new Error("Unknown RPC") };
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      }),
    }),
  } as unknown as SupabaseClient<Database>;

  const nonStaffResult = await verifyStaffSession(mockNonStaffClient);
  assert(
    nonStaffResult.status === "forbidden_not_staff" &&
      nonStaffResult.user?.id === customerUser.id &&
      nonStaffResult.staffUser === null,
    "3. Authenticated non-staff user is rejected with 'forbidden_not_staff' status (HTTP 403 / redirect to login?error=forbidden)"
  );

  // Mock 4: Active Kitchen Staff User
  const staffAuthUser: User = {
    id: "44444444-4444-4444-4444-444444444444",
    app_metadata: {},
    user_metadata: { full_name: "Line Cook 1" },
    aud: "authenticated",
    created_at: new Date().toISOString(),
    email: "kitchen1@emberandoak.com",
  };

  const mockStaffDbRecord: DbStaffUser = {
    id: staffAuthUser.id,
    email: "kitchen1@emberandoak.com",
    full_name: "Line Cook 1",
    role: "kitchen_staff",
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const mockStaffClient = {
    auth: {
      getUser: async () => ({ data: { user: staffAuthUser }, error: null }),
    },
    rpc: async (fn: string) => {
      if (fn === "is_staff") return { data: true, error: null };
      if (fn === "is_admin") return { data: false, error: null };
      return { data: null, error: new Error("Unknown RPC") };
    },
    from: (table: string) => {
      if (table === "staff_users") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: mockStaffDbRecord, error: null }),
              }),
            }),
          }),
        };
      }
      return {};
    },
  } as unknown as SupabaseClient<Database>;

  const staffResult = await verifyStaffSession(mockStaffClient);
  assert(
    staffResult.status === "authenticated_staff" &&
      staffResult.role === "kitchen_staff" &&
      staffResult.staffUser?.email === "kitchen1@emberandoak.com" &&
      staffResult.staffUser?.role === "kitchen_staff",
    "4. Authorized active kitchen staff user is granted 'authenticated_staff' with role 'kitchen_staff'"
  );

  // Mock 5: Inactive Staff User (is_active = false)
  const inactiveStaffUser: User = {
    id: "55555555-5555-5555-5555-555555555555",
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: new Date().toISOString(),
    email: "inactive_cook@emberandoak.com",
  };

  const mockInactiveStaffClient = {
    auth: {
      getUser: async () => ({ data: { user: inactiveStaffUser }, error: null }),
    },
    rpc: async (fn: string) => {
      if (fn === "is_staff") return { data: false, error: null }; // is_staff checks is_active = true
      if (fn === "is_admin") return { data: false, error: null };
      return { data: null, error: new Error("Unknown RPC") };
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      }),
    }),
  } as unknown as SupabaseClient<Database>;

  const inactiveResult = await verifyStaffSession(mockInactiveStaffClient);
  assert(
    inactiveResult.status === "forbidden_not_staff",
    "5. Inactive staff member (is_active = false) is rejected with 'forbidden_not_staff'"
  );

  // Mock 6: Deliberate Admin Access (Cafe Manager inspecting kitchen dashboard)
  const adminUser: User = {
    id: "66666666-6666-6666-6666-666666666666",
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: new Date().toISOString(),
    email: "admin@emberandoak.com",
  };

  const mockAdminClient = {
    auth: {
      getUser: async () => ({ data: { user: adminUser }, error: null }),
    },
    rpc: async (fn: string) => {
      if (fn === "is_staff") return { data: false, error: null };
      if (fn === "is_admin") return { data: true, error: null };
      return { data: null, error: new Error("Unknown RPC") };
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      }),
    }),
  } as unknown as SupabaseClient<Database>;

  const adminInStaffResult = await verifyStaffSession(mockAdminClient);
  assert(
    adminInStaffResult.status === "authenticated_staff" &&
      adminInStaffResult.role === "admin" &&
      adminInStaffResult.user.id === adminUser.id,
    "6. Deliberate Admin access is permitted on kitchen routes with role 'admin'"
  );

  // Mock 7: Kitchen staff attempting to access Admin Portal
  const staffAttemptingAdminResult = await verifyAdminSession(mockStaffClient);
  assert(
    staffAttemptingAdminResult.status === "forbidden_not_admin",
    "7. Kitchen staff cannot access admin portal (rejected by verifyAdminSession with 'forbidden_not_admin')"
  );
}

function runCodebaseSecurityAudits() {
  console.log("\n--- Part 2: Security & Credential Hygiene Audits ---");

  // Check 1: Client code must not import getAdminClient or SUPABASE_SERVICE_ROLE_KEY
  const clientFilesToCheck = [
    "app/staff/login/page.tsx",
    "app/staff/(protected)/client-layout.tsx",
    "app/admin/login/page.tsx",
    "app/admin/(protected)/client-layout.tsx",
    "lib/supabase/client.ts",
  ];

  for (const relPath of clientFilesToCheck) {
    const fullPath = path.resolve(process.cwd(), relPath);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, "utf-8");
      const hasServiceRoleImport =
        content.includes("getAdminClient") ||
        content.includes("SUPABASE_SERVICE_ROLE_KEY") ||
        content.includes("service_role");

      assert(
        !hasServiceRoleImport,
        `Client component ${relPath} does not reference privileged service role credentials`
      );
    }
  }

  // Check 2: No public registration endpoint or form
  const staffLoginContent = fs.readFileSync(
    path.resolve(process.cwd(), "app/staff/login/page.tsx"),
    "utf-8"
  );
  const hasRegisterForm =
    staffLoginContent.includes("Sign Up") ||
    staffLoginContent.includes("Create an account") ||
    staffLoginContent.includes("Register") ||
    staffLoginContent.includes("signUp(");

  assert(
    !hasRegisterForm,
    "No public staff registration form or link exists on /staff/login"
  );

  // Check 3: Middleware configuration covers /staff and /admin
  const middlewareContent = fs.readFileSync(
    path.resolve(process.cwd(), "middleware.ts"),
    "utf-8"
  );
  assert(
    middlewareContent.includes("/staff") &&
      middlewareContent.includes("/staff/login") &&
      middlewareContent.includes("/admin") &&
      middlewareContent.includes("/admin/login"),
    "Middleware matcher and route logic covers both /admin and /staff pathways"
  );
}

async function main() {
  console.log("=================================================================");
  console.log("Phase 1: Kitchen Staff Authentication & Authorization Test Suite");
  console.log("=================================================================");

  await runUnitAndMockTests();
  runCodebaseSecurityAudits();

  console.log("\n=================================================================");
  console.log(`Results: ${passedCount} passed, ${failedCount} failed`);
  console.log("=================================================================");

  if (failedCount > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
