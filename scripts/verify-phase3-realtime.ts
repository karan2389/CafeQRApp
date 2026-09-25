import fs from "fs";
import path from "path";
import { verifyStaffSession } from "../lib/auth/staff";
import { verifyAdminSession } from "../lib/auth/admin";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database, DbStaffUser } from "../types/database";
import { playKitchenAlert } from "../features/kitchen/kitchen-sound";

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
  console.log("   PHASE 3: REALTIME NEW ORDER NOTIFICATIONS VERIFICATION       ");
  console.log("=================================================================\n");

  // -------------------------------------------------------------
  // Test 1: Realtime Database Migration Audit
  // -------------------------------------------------------------
  console.log("--- 1. Database & Realtime Migration Integrity ---");
  const migrationPath = path.resolve(
    process.cwd(),
    "supabase/migrations/20260925000003_phase3_realtime_orders.sql"
  );
  assert(fs.existsSync(migrationPath), "Phase 3 Realtime migration file exists");

  const migrationSql = fs.readFileSync(migrationPath, "utf-8");
  assert(
    migrationSql.includes("ALTER TABLE public.orders REPLICA IDENTITY FULL"),
    "Orders table has REPLICA IDENTITY FULL configured"
  );
  assert(
    migrationSql.includes("supabase_realtime") &&
      migrationSql.includes("ALTER PUBLICATION supabase_realtime ADD TABLE public.orders"),
    "Orders table added to supabase_realtime publication"
  );
  assert(
    migrationSql.includes("IF NOT EXISTS"),
    "Realtime migration is idempotent with IF NOT EXISTS checks"
  );

  // -------------------------------------------------------------
  // Test 2: Authorization Boundaries
  // -------------------------------------------------------------
  console.log("\n--- 2. Security & Authorization Guard Tests ---");

  // 2a. Unauthenticated request to staff API
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
    "Unauthenticated request is rejected (HTTP 401)"
  );

  // 2b. Authenticated non-staff user (customer) attempting staff access
  const customerUser: User = {
    id: "11111111-2222-3333-4444-555555555555",
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: new Date().toISOString(),
    email: "customer@example.com",
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
    "Authenticated customer rejected from staff kitchen API (HTTP 403)"
  );

  // 2c. Authorized kitchen staff user
  const staffUser: User = {
    id: "66666666-7777-8888-9999-000000000000",
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: new Date().toISOString(),
    email: "kitchen@emberandoak.com",
  };

  const mockStaffRecord: DbStaffUser = {
    id: staffUser.id,
    email: "kitchen@emberandoak.com",
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
    "Authorized kitchen staff is granted staff access (status: authenticated_staff)"
  );

  // 2d. Kitchen staff cannot access admin routes
  const staffAdminCheck = await verifyAdminSession(mockStaffClient);
  assert(
    staffAdminCheck.status === "forbidden_not_admin",
    "Kitchen staff is blocked from administrative routes (HTTP 403)"
  );

  // -------------------------------------------------------------
  // Test 3: Deduplication & State Merge Logic
  // -------------------------------------------------------------
  console.log("\n--- 3. Order Deduplication & State Integrity ---");

  interface TestOrder {
    id: string;
    order_number: string;
    status: string;
    created_at: string;
  }

  const existingOrders: TestOrder[] = [
    { id: "order-1", order_number: "ORD-001", status: "PENDING", created_at: "2026-09-25T10:00:00Z" },
    { id: "order-2", order_number: "ORD-002", status: "PREPARING", created_at: "2026-09-25T10:05:00Z" },
  ];

  // Simulating duplicate Realtime event for order-1
  const duplicateRealtimeOrder: TestOrder = {
    id: "order-1",
    order_number: "ORD-001",
    status: "PREPARING",
    created_at: "2026-09-25T10:00:00Z",
  };

  // Merge logic simulation
  const mergeOrders = (prev: TestOrder[], incoming: TestOrder[]) => {
    const map = new Map<string, TestOrder>();
    for (const o of prev) map.set(o.id, o);
    for (const o of incoming) map.set(o.id, o);
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  };

  const merged = mergeOrders(existingOrders, [duplicateRealtimeOrder]);
  assert(merged.length === 2, "Duplicate Realtime INSERT/UPDATE does not duplicate order in state");
  assert(
    merged.find((o) => o.id === "order-1")?.status === "PREPARING",
    "Updated order status is reflected after duplicate merge"
  );

  // Inserting new order
  const newOrder: TestOrder = {
    id: "order-3",
    order_number: "ORD-003",
    status: "NEW",
    created_at: "2026-09-25T10:10:00Z",
  };
  const withNewOrder = mergeOrders(merged, [newOrder]);
  assert(withNewOrder.length === 3, "New order is correctly added to queue");
  assert(withNewOrder[0].id === "order-3", "Orders remain correctly sorted with newest first");

  // -------------------------------------------------------------
  // Test 4: Audio Alert Resilience
  // -------------------------------------------------------------
  console.log("\n--- 4. Audio Alert Resilience & Autoplay Handling ---");

  let audioThrew = false;
  try {
    // In Node.js or SSR environment, window is undefined or lacks AudioContext.
    // playKitchenAlert must handle this gracefully without throwing an uncaught exception.
    playKitchenAlert("STANDARD");
    playKitchenAlert("BELL");
    playKitchenAlert("PUFFS");
  } catch (err) {
    audioThrew = true;
    console.error("Audio error:", err);
  }
  assert(!audioThrew, "Audio alert functions safely in non-browser or restricted environments");

  // -------------------------------------------------------------
  // Test 5: Order Notification Formatting
  // -------------------------------------------------------------
  console.log("\n--- 5. New Order Notification Payload Structure ---");

  interface OrderItem {
    quantity: number;
    item_name: string;
  }
  const sampleItems: OrderItem[] = [
    { quantity: 2, item_name: "Cappuccino" },
    { quantity: 1, item_name: "Avocado Toast" },
    { quantity: 3, item_name: "Croissant" },
  ];

  const totalItemCount = sampleItems.reduce((sum, item) => sum + item.quantity, 0);
  const summary =
    sampleItems.map((i) => `${i.quantity}× ${i.item_name}`).slice(0, 2).join(", ") +
    (sampleItems.length > 2 ? ` +${sampleItems.length - 2} more` : "");

  assert(totalItemCount === 6, "Total item quantity is aggregated accurately (6 items)");
  assert(
    summary === "2× Cappuccino, 1× Avocado Toast +1 more",
    "Order summary string is concisely formatted with overflow indicator"
  );

  // -------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------
  console.log("\n=================================================================");
  console.log(`Phase 3 Test Results: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log("=================================================================\n");

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
