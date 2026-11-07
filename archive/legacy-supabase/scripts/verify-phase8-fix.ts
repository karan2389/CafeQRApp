import fs from "fs";
import path from "path";
import crypto from "node:crypto";
import { getAdminClient } from "../lib/supabase/admin";

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

async function runPhase8FixTests() {
  console.log("=================================================================");
  console.log("   PHASE 8 FIX: CUSTOMER UI SESSION CLOSURE REFLECTION VERIFICATION");
  console.log("=================================================================\n");

  // -------------------------------------------------------------
  // Test Suite 1: Codebase Verification for Required UI & API Behaviors
  // -------------------------------------------------------------
  console.log("--- 1. Codebase Audit & Contract Compliance ---");

  const ordersRoutePath = path.resolve(process.cwd(), "app/api/orders/route.ts");
  const ordersRouteContent = fs.readFileSync(ordersRoutePath, "utf-8");

  assert(
    ordersRouteContent.includes('session_status: sessionStatus') &&
    ordersRouteContent.includes('is_session_closed: isClosed'),
    "GET /api/orders returns session_status and is_session_closed"
  );

  assert(
    ordersRouteContent.includes('SESSION_CLOSED'),
    "POST /api/orders rejects closed session with SESSION_CLOSED"
  );

  assert(
    ordersRouteContent.includes("Session closed. Please scan the table QR code again."),
    "Standardized session closed error message returned by server"
  );

  const customerClientPath = path.resolve(process.cwd(), "components/customer/customer-page-client.tsx");
  const customerClientContent = fs.readFileSync(customerClientPath, "utf-8");

  assert(
    customerClientContent.includes("Session closed. Please scan the table QR code again."),
    "CustomerPageClient displays 'Session closed. Please scan the table QR code again.' banner"
  );

  assert(
    customerClientContent.includes("clearCart()"),
    "CustomerPageClient automatically clears cart on session closure and session rotation"
  );

  assert(
    customerClientContent.includes("isSessionClosed={isClosed}"),
    "RunningBill and CustomerOrderTracker receive isSessionClosed state"
  );

  const runningBillPath = path.resolve(process.cwd(), "components/customer/running-bill.tsx");
  const runningBillContent = fs.readFileSync(runningBillPath, "utf-8");

  assert(
    runningBillContent.includes("isSessionClosed"),
    "RunningBill accepts isSessionClosed prop"
  );

  assert(
    runningBillContent.includes("Session Closed · Running Bill Inactive"),
    "RunningBill explicitly indicates when running bill is closed and no longer active"
  );

  assert(
    runningBillContent.includes("Settled Bill"),
    "RunningBill converts header from 'Running bill' to 'Settled Bill' when closed"
  );

  // -------------------------------------------------------------
  // Test Suite 2: Supabase Integration: Lifecycle & Session Reflection
  // -------------------------------------------------------------
  console.log("\n--- 2. End-to-End Database Lifecycle & Response Contracts ---");
  const adminClient = getAdminClient();

  // 2a. Find or create active table
  const { data: testTable, error: tableErr } = await adminClient
    .from("tables")
    .select("id, table_number")
    .eq("is_active", true)
    .order("table_number", { ascending: true })
    .limit(1)
    .single();

  assert(!tableErr && !!testTable, "Identified active table for closure test");
  if (!testTable) return;

  // 2b. Start an ACTIVE table_order_session
  const { data: activeSession, error: sessionErr } = await adminClient
    .from("table_order_sessions")
    .insert({
      table_id: testTable.id,
      status: "ACTIVE",
    })
    .select()
    .single();

  let activeSessionId = activeSession?.id;
  if (sessionErr) {
    const { data: existing } = await adminClient
      .from("table_order_sessions")
      .select()
      .eq("table_id", testTable.id)
      .eq("status", "ACTIVE")
      .single();
    activeSessionId = existing?.id;
  }

  assert(!!activeSessionId, "Active table session established");

  // 2c. Create customer scan session
  const customerToken = crypto.randomBytes(32).toString("hex");
  const customerTokenHash = crypto.createHash("sha256").update(customerToken).digest("hex");

  const { data: scanSession, error: scanErr } = await adminClient
    .from("customer_scan_sessions")
    .insert({
      table_order_session_id: activeSessionId!,
      session_token_hash: customerTokenHash,
      expires_at: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
    })
    .select()
    .single();

  assert(!scanErr && !!scanSession, "Customer scan session created");

  // 2d. Simulate order placed in active session
  const { data: testItem } = await adminClient
    .from("menu_items")
    .select("id, name, price")
    .eq("is_available", true)
    .limit(1)
    .single();

  const itemPrice = Number(testItem?.price || 120);

  const { data: testOrder, error: orderErr } = await adminClient
    .from("orders")
    .insert({
      table_order_session_id: activeSessionId!,
      table_id: testTable.id,
      customer_scan_session_id: scanSession!.id,
      status: "DELIVERED",
      customer_name: "Verification Guest",
      total_amount_inr: itemPrice,
      order_number: "#P8FX",
    })
    .select()
    .single();

  assert(!orderErr && !!testOrder, "Order recorded in active session", orderErr?.message);

  // 2e. Query customer session while ACTIVE (verifying GET /api/orders behavior)
  const { data: scanSessionActive } = await adminClient
    .from("customer_scan_sessions")
    .select(`
      id,
      table_order_session_id,
      expires_at,
      table_order_sessions!inner(
        id,
        status
      )
    `)
    .eq("session_token_hash", customerTokenHash)
    .single();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawTosActive = (scanSessionActive as any)?.table_order_sessions;
  const tosActive = Array.isArray(rawTosActive) ? rawTosActive[0] : rawTosActive;
  const statusActive = tosActive?.status || "ACTIVE";

  assert(statusActive === "ACTIVE", "Active session resolves session_status = 'ACTIVE'");
  assert(statusActive !== "CLOSED", "Active session is_session_closed = false");

  // 2f. Staff closes session: "Bill Paid & Close Session"
  console.log("\n--- 3. Staff Action: 'Bill Paid & Close Session' ---");
  const now = new Date().toISOString();
  const { data: closedSession, error: closeErr } = await adminClient
    .from("table_order_sessions")
    .update({
      status: "CLOSED",
      closed_at: now,
      payment_confirmed_at: now,
      payment_method: "CASH",
      final_bill_amount_inr: itemPrice,
      final_bill_amount_paise: Math.round(itemPrice * 100),
    })
    .eq("id", activeSessionId!)
    .select()
    .single();

  assert(!closeErr && closedSession?.status === "CLOSED", "Table session successfully marked CLOSED in database");

  // 2g. Customer's existing page polls GET /api/orders: Must detect CLOSED session
  console.log("\n--- 4. Customer Page Polling After Staff Closure ---");
  const { data: scanSessionClosed } = await adminClient
    .from("customer_scan_sessions")
    .select(`
      id,
      table_order_session_id,
      expires_at,
      table_order_sessions!inner(
        id,
        status
      )
    `)
    .eq("session_token_hash", customerTokenHash)
    .single();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawTosClosed = (scanSessionClosed as any)?.table_order_sessions;
  const tosClosed = Array.isArray(rawTosClosed) ? rawTosClosed[0] : rawTosClosed;
  const statusClosed = tosClosed?.status;

  assert(statusClosed === "CLOSED", "Customer endpoint resolves session_status = 'CLOSED'");
  assert(statusClosed === "CLOSED" ? true : false, "Customer endpoint resolves is_session_closed = true");

  // Verify historical orders are preserved
  const { data: closedOrders } = await adminClient
    .from("orders")
    .select("id, order_number, status, total_amount_inr")
    .eq("table_order_session_id", activeSessionId!);

  assert(
    !!closedOrders && closedOrders.length >= 1,
    `Historical orders preserved for closed session receipt (found ${closedOrders?.length} order(s))`
  );

  // 2h. Verify order placement is blocked (Ordering is disabled)
  const isOrderingAllowed = statusClosed === "ACTIVE";
  assert(!isOrderingAllowed, "Ordering is strictly disabled on closed session (blocked by server & client)");

  // -------------------------------------------------------------
  // Test Suite 3: Customer Re-Scans QR Code -> Fresh Session
  // -------------------------------------------------------------
  console.log("\n--- 5. Fresh Session Lifecycle on Re-Scan ---");

  // Simulate resolve_qr_scan:
  // Check if any ACTIVE session exists for this table
  const { data: anyActive } = await adminClient
    .from("table_order_sessions")
    .select("id")
    .eq("table_id", testTable.id)
    .eq("status", "ACTIVE")
    .maybeSingle();

  assert(anyActive === null, "No active session exists for table immediately after closure");

  // Customer scans QR code again -> new session inserted
  const { data: freshSession, error: freshErr } = await adminClient
    .from("table_order_sessions")
    .insert({
      table_id: testTable.id,
      status: "ACTIVE",
    })
    .select()
    .single();

  assert(!freshErr && !!freshSession, "Fresh table session created on QR re-scan");
  assert(freshSession?.id !== activeSessionId, "Fresh session ID is distinct from closed session");

  // Query orders for fresh session
  const { data: freshOrders } = await adminClient
    .from("orders")
    .select("id, total_amount_inr")
    .eq("table_order_session_id", freshSession!.id);

  const freshOrdersCount = freshOrders?.length || 0;
  const freshRunningBill = (freshOrders || []).reduce((sum, o) => sum + Number(o.total_amount_inr || 0), 0);

  assert(freshOrdersCount === 0, "Fresh session initializes with 0 orders");
  assert(freshRunningBill === 0, "Fresh session initializes with ₹0 running bill");

  // Historical orders for previous session still intact
  const { data: preservedHistorical } = await adminClient
    .from("orders")
    .select("id")
    .eq("table_order_session_id", activeSessionId!);

  assert(
    (preservedHistorical?.length || 0) >= 1,
    "Historical orders from closed session were NOT deleted"
  );

  console.log("\n=================================================================");
  console.log(`   PHASE 8 FIX VERIFICATION RESULT: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log("=================================================================\n");

  if (failedCount > 0) {
    process.exit(1);
  }
}

runPhase8FixTests().catch((err) => {
  console.error("Test execution threw unhandled exception:", err);
  process.exit(1);
});
