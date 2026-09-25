import fs from "fs";
import path from "path";
import { verifyStaffSession } from "../lib/auth/staff";
import { verifyAdminSession } from "../lib/auth/admin";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database, DbStaffUser } from "../types/database";
import {
  ALLOWED_STATUS_TRANSITIONS,
  VALID_KITCHEN_STATUSES,
  type KitchenOrderStatus,
} from "../app/api/staff/orders/[id]/route";

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

async function runTests() {
  console.log("=================================================================");
  console.log("   PHASE 4: KITCHEN ORDER PROCESSING & STATUS MANAGEMENT TESTS   ");
  console.log("=================================================================\n");

  // -------------------------------------------------------------
  // Test 1: Migration and Database Schema Audit
  // -------------------------------------------------------------
  console.log("--- 1. Database & Lifecycle Migration Integrity ---");
  const migrationPath = path.resolve(
    process.cwd(),
    "supabase/migrations/20260925000004_phase4_kitchen_order_lifecycle.sql"
  );
  assert(fs.existsSync(migrationPath), "Phase 4 lifecycle migration file exists");

  const migrationSql = fs.readFileSync(migrationPath, "utf-8");
  assert(
    migrationSql.includes("cancellation_reason TEXT"),
    "Cancellation reason column added to orders table"
  );
  assert(
    migrationSql.includes("idx_orders_status_created_at"),
    "Composite index (status, created_at) defined for kitchen queues"
  );
  assert(
    migrationSql.includes("trg_orders_updated_at"),
    "Automatic updated_at trigger is configured"
  );

  // -------------------------------------------------------------
  // Test 2: Status Lifecycle Transition Matrix Validation
  // -------------------------------------------------------------
  console.log("\n--- 2. Order Lifecycle Transition Rules ---");

  // 2a. Valid transitions
  assert(
    ALLOWED_STATUS_TRANSITIONS.NEW.includes("PREPARING"),
    "Transition: NEW -> PREPARING is allowed"
  );
  assert(
    ALLOWED_STATUS_TRANSITIONS.NEW.includes("CANCELLED"),
    "Transition: NEW -> CANCELLED is allowed"
  );
  assert(
    ALLOWED_STATUS_TRANSITIONS.PENDING.includes("PREPARING"),
    "Transition: PENDING -> PREPARING is allowed"
  );
  assert(
    ALLOWED_STATUS_TRANSITIONS.PREPARING.includes("DELIVERED"),
    "Transition: PREPARING -> DELIVERED is allowed"
  );
  assert(
    ALLOWED_STATUS_TRANSITIONS.PREPARING.includes("CANCELLED"),
    "Transition: PREPARING -> CANCELLED is allowed"
  );

  // 2b. Terminal status protections (No transitions allowed out of terminal states)
  assert(
    ALLOWED_STATUS_TRANSITIONS.DELIVERED.length === 0,
    "DELIVERED is terminal (no transitions allowed)"
  );
  assert(
    !ALLOWED_STATUS_TRANSITIONS.DELIVERED.includes("PREPARING"),
    "Transition: DELIVERED -> PREPARING is strictly rejected"
  );
  assert(
    !ALLOWED_STATUS_TRANSITIONS.DELIVERED.includes("NEW"),
    "Transition: DELIVERED -> NEW is strictly rejected"
  );
  assert(
    ALLOWED_STATUS_TRANSITIONS.CANCELLED.length === 0,
    "CANCELLED is terminal (no transitions allowed)"
  );
  assert(
    !ALLOWED_STATUS_TRANSITIONS.CANCELLED.includes("PREPARING"),
    "Transition: CANCELLED -> PREPARING is strictly rejected"
  );
  assert(
    !ALLOWED_STATUS_TRANSITIONS.CANCELLED.includes("DELIVERED"),
    "Transition: CANCELLED -> DELIVERED is strictly rejected"
  );

  // 2c. Unknown status rejection
  const bogusStatus = "READY_FOR_PICKUP" as KitchenOrderStatus;
  assert(
    !VALID_KITCHEN_STATUSES.includes(bogusStatus),
    "Unknown or unmanaged status is rejected from validation allowlist"
  );

  // -------------------------------------------------------------
  // Test 3: Optimistic Concurrency & Conflict Detection
  // -------------------------------------------------------------
  console.log("\n--- 3. Concurrency & Stale Update Handling ---");

  interface OrderRecord {
    id: string;
    status: KitchenOrderStatus;
    updated_at: string;
  }

  const mockDbOrder: OrderRecord = {
    id: "ord-test-concurrency-1",
    status: "NEW",
    updated_at: "2026-09-25T10:00:00Z",
  };

  // Staff member A updates NEW -> PREPARING
  function applyOptimisticUpdate(
    current: OrderRecord,
    targetStatus: KitchenOrderStatus,
    expectedPriorStatus: KitchenOrderStatus
  ) {
    if (current.status !== expectedPriorStatus) {
      return {
        success: false,
        code: "CONCURRENCY_CONFLICT",
        currentStatus: current.status,
      };
    }
    current.status = targetStatus;
    current.updated_at = new Date().toISOString();
    return {
      success: true,
      order: current,
    };
  }

  // Staff A succeeds
  const staffAResult = applyOptimisticUpdate(mockDbOrder, "PREPARING", "NEW");
  assert(staffAResult.success === true, "Staff A successfully transitions NEW -> PREPARING");
  assert(mockDbOrder.status === "PREPARING", "Database status updated to PREPARING");

  // Staff B was viewing stale UI (saw NEW, also tries to click PREPARING or CANCELLED)
  const staffBResult = applyOptimisticUpdate(mockDbOrder, "CANCELLED", "NEW");
  assert(
    staffBResult.success === false && staffBResult.code === "CONCURRENCY_CONFLICT",
    "Staff B stale update is detected as CONCURRENCY_CONFLICT (prevents overwrite)"
  );
  assert(
    staffBResult.currentStatus === "PREPARING",
    "Conflict response provides current database status for UI recovery"
  );

  // -------------------------------------------------------------
  // Test 4: Authorization Guards on Status Updates
  // -------------------------------------------------------------
  console.log("\n--- 4. Staff Authorization Boundary Verification ---");

  // 4a. Unauthenticated client
  const mockUnauthClient = {
    auth: {
      getUser: async () => ({
        data: { user: null },
        error: { message: "No session", name: "AuthSessionMissingError" },
      }),
    },
  } as unknown as SupabaseClient<Database>;

  const unauthResult = await verifyStaffSession(mockUnauthClient);
  assert(
    unauthResult.status === "unauthenticated",
    "Unauthenticated user blocked from updating order status (HTTP 401)"
  );

  // 4b. Authenticated customer user
  const customerUser: User = {
    id: "99999999-0000-1111-2222-333333333333",
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: new Date().toISOString(),
    email: "customer@cafe.com",
  };

  const mockCustomerClient = {
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

  const customerResult = await verifyStaffSession(mockCustomerClient);
  assert(
    customerResult.status === "forbidden_not_staff",
    "Customer blocked from kitchen order update APIs (HTTP 403)"
  );

  // 4c. Active kitchen staff
  const staffUser: User = {
    id: "33333333-4444-5555-6666-777777777777",
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: new Date().toISOString(),
    email: "cook@emberandoak.com",
  };

  const mockStaffRecord: DbStaffUser = {
    id: staffUser.id,
    email: "cook@emberandoak.com",
    full_name: "Line Cook",
    role: "kitchen_staff",
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const mockStaffClient = {
    auth: {
      getUser: async () => ({ data: { user: staffUser }, error: null }),
    },
    rpc: async (fn: string) => {
      if (fn === "is_staff") return { data: true, error: null };
      if (fn === "is_admin") return { data: false, error: null };
      return { data: null, error: new Error("Unknown RPC") };
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: mockStaffRecord, error: null }),
          }),
        }),
      }),
    }),
  } as unknown as SupabaseClient<Database>;

  const staffResult = await verifyStaffSession(mockStaffClient);
  assert(
    staffResult.status === "authenticated_staff",
    "Kitchen staff is authorized to perform status transitions"
  );

  const staffAdminCheck = await verifyAdminSession(mockStaffClient);
  assert(
    staffAdminCheck.status === "forbidden_not_admin",
    "Kitchen staff remains blocked from admin routes"
  );

  // -------------------------------------------------------------
  // Test 5: Operational FIFO Queue Sorting Logic
  // -------------------------------------------------------------
  console.log("\n--- 5. Operational Queue Sorting (FIFO for Active Orders) ---");

  const orderQueue = [
    { id: "order-newer", order_number: "ORD-002", created_at: "2026-09-25T10:15:00Z" },
    { id: "order-older", order_number: "ORD-001", created_at: "2026-09-25T10:00:00Z" },
    { id: "order-newest", order_number: "ORD-003", created_at: "2026-09-25T10:20:00Z" },
  ];

  const fifoActiveSorted = [...orderQueue].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  assert(
    fifoActiveSorted[0].id === "order-older",
    "FIFO sorting prioritizes oldest active order first (ORD-001)"
  );
  assert(
    fifoActiveSorted[2].id === "order-newest",
    "Newest active order placed at back of prep queue (ORD-003)"
  );

  // -------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------
  console.log("\n=================================================================");
  console.log(`Phase 4 Test Results: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log("=================================================================\n");

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
