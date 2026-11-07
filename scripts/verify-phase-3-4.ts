import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import { Id } from "../convex/_generated/dataModel.js";
import crypto from "crypto";

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL || "https://outgoing-perch-487.convex.cloud";
const CONVEX_SITE_URL = process.env.NEXT_PUBLIC_CONVEX_SITE_URL || "https://outgoing-perch-487.convex.site";
const CONVEX_SERVER_SECRET = process.env.CONVEX_SERVER_SECRET;

if (!CONVEX_SERVER_SECRET) {
  console.error("FATAL: CONVEX_SERVER_SECRET must be set in environment.");
  process.exit(1);
}

console.log("==================================================================");
console.log("  COURISTA — PHASE 3.4 VERIFICATION SUITE                         ");
console.log("  Group F: Running Bill, Payment Settlement & Session Closure     ");
console.log("==================================================================");
console.log(`Convex Cloud URL: ${CONVEX_URL}`);
console.log(`Convex Site URL:  ${CONVEX_SITE_URL}`);

const client = new ConvexHttpClient(CONVEX_URL);

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    passedCount++;
    console.log(`  [PASS] ${testName}`);
    if (detail) console.log(`         ${detail}`);
  } else {
    failedCount++;
    console.error(`  [FAIL] ${testName}`);
    if (detail) console.error(`         ${detail}`);
  }
}

function sha256Hex(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

async function runPhase34Tests() {
  try {
    console.log("\n--- 0. AUTHENTICATION BOOTSTRAP ---");

    // 1. Admin login credentials
    const adminEmail = `admin-p34-${Date.now()}@courista.test`;
    const adminPass = "SecureAdminP34!#2026";
    const adminSignup = await client.action(api.auth.signIn, {
      provider: "password",
      params: {
        email: adminEmail,
        password: adminPass,
        name: "Phase 3.4 Admin Auditor",
        role: "admin",
        flow: "signUp",
      },
    });
    const adminToken = adminSignup!.tokens!.token;
    assert(Boolean(adminToken), "Admin bootstrap authentication token acquired");

    // 2. Kitchen Staff login credentials
    const staffEmail = `staff-p34-${Date.now()}@courista.test`;
    const staffPass = "KitchenStaffP34!#2026";
    const staffSignup = await client.action(api.auth.signIn, {
      provider: "password",
      params: {
        email: staffEmail,
        password: staffPass,
        name: "Phase 3.4 Floor Manager",
        role: "kitchen_staff",
        flow: "signUp",
      },
    });
    const staffToken = staffSignup!.tokens!.token;
    assert(Boolean(staffToken), "Staff bootstrap authentication token acquired");

    console.log("\n--- 1. FIXTURE SETUP: TABLES, MENUS & DINING SESSIONS ---");

    client.setAuth(adminToken);

    // Setup Table 6 (Primary dining table for multi-order billing tests)
    const t6StandSecret = "table-6-physical-stand-secret-p34";
    const fixture6 = await client.mutation(api.test_helpers.seedTestFixture, {
      tableNumber: 6,
      rawCustomerToken: crypto.randomBytes(32).toString("hex"),
      rawReadCapabilityToken: crypto.randomBytes(32).toString("hex"),
    });
    await client.mutation(api.tables.adminRegenerateTableQrToken, {
      tableId: fixture6.tableId,
      newQrTokenHash: sha256Hex(t6StandSecret),
    });

    // Create Category & Menu Items
    const categoryResult = await client.mutation(api.categories.createCategory, {
      name: "Chef Curated Dinner",
      slug: `chef-dinner-${Date.now()}`,
      displayOrder: 1,
      isActive: true,
    });

    const itemStarter = await client.mutation(api.menu.createMenuItem, {
      categoryId: categoryResult.categoryId,
      name: "Smoked Burrata & Figs",
      description: "Artisan burrata with balsamic glaze",
      pricePaise: 38000, // ₹380.00
      displayOrder: 1,
      isAvailable: true,
    });

    const itemMain = await client.mutation(api.menu.createMenuItem, {
      categoryId: categoryResult.categoryId,
      name: "Oak Smoked Duck Breast",
      description: "Slow-roasted duck breast with cherry reduction",
      pricePaise: 75000, // ₹750.00
      displayOrder: 2,
      isAvailable: true,
    });

    const itemDessert = await client.mutation(api.menu.createMenuItem, {
      categoryId: categoryResult.categoryId,
      name: "Cardamom Panna Cotta",
      description: "Infused cream with pistachio crumble",
      pricePaise: 29000, // ₹290.00
      displayOrder: 3,
      isAvailable: true,
    });

    // Resolve Scan for Table 6 (Device 1)
    const resolveScanUrl = `${CONVEX_SITE_URL}/server/sessions/resolve-scan`;
    const dev1Write = crypto.randomBytes(32).toString("hex");
    const dev1Read = crypto.randomBytes(32).toString("hex");

    const scan1Res = await fetch(resolveScanUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CONVEX_SERVER_SECRET}`,
      },
      body: JSON.stringify({
        tableSlug: "table-6",
        qrToken: t6StandSecret,
        rawCustomerWriteToken: dev1Write,
        rawReadCapabilityToken: dev1Read,
      }),
    });
    const scan1Data = (await scan1Res.json()) as {
      tableOrderSessionId: Id<"tableOrderSessions">;
      customerScanSessionId: Id<"customerScanSessions">;
    };
    assert(scan1Res.status === 200, "Device 1 attached to Table 6 dining session");

    // Resolve Scan for Table 6 (Device 2 - Co-diner)
    const dev2Write = crypto.randomBytes(32).toString("hex");
    const dev2Read = crypto.randomBytes(32).toString("hex");

    const scan2Res = await fetch(resolveScanUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CONVEX_SERVER_SECRET}`,
      },
      body: JSON.stringify({
        tableSlug: "table-6",
        qrToken: t6StandSecret,
        rawCustomerWriteToken: dev2Write,
        rawReadCapabilityToken: dev2Read,
      }),
    });
    const scan2Data = (await scan2Res.json()) as {
      tableOrderSessionId: Id<"tableOrderSessions">;
      customerScanSessionId: Id<"customerScanSessions">;
    };
    assert(
      scan2Res.status === 200 && scan2Data.tableOrderSessionId === scan1Data.tableOrderSessionId,
      "Device 2 attached to the shared Table 6 dining session"
    );

    console.log("\n--- GROUP F.1: RUNNING BILL ACCUMULATION & SEGREGATION ---");

    const orderSubmitUrl = `${CONVEX_SITE_URL}/server/orders/submit`;

    // Order 1: Device 1 orders Starters (2x Burrata = ₹760 = 76000 paise)
    const ord1Res = await fetch(orderSubmitUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CONVEX_SERVER_SECRET}`,
      },
      body: JSON.stringify({
        rawCustomerWriteToken: dev1Write,
        items: [{ menuItemId: itemStarter.menuItemId, quantity: 2 }],
        customerName: "Ananya",
        idempotencyKey: `p34-ord1-${Date.now()}`,
      }),
    });
    const ord1Data = (await ord1Res.json()) as { orderId: Id<"orders">; totalAmountPaise: number };
    assert(ord1Res.status === 200 && ord1Data.totalAmountPaise === 76000, "Order 1 placed: 2x Burrata (76000 paise)");

    // Order 2: Device 2 orders Mains (2x Duck = ₹1500 = 150000 paise)
    const ord2Res = await fetch(orderSubmitUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CONVEX_SERVER_SECRET}`,
      },
      body: JSON.stringify({
        rawCustomerWriteToken: dev2Write,
        items: [{ menuItemId: itemMain.menuItemId, quantity: 2 }],
        customerName: "Vikram",
        idempotencyKey: `p34-ord2-${Date.now()}`,
      }),
    });
    const ord2Data = (await ord2Res.json()) as { orderId: Id<"orders">; totalAmountPaise: number };
    assert(ord2Res.status === 200 && ord2Data.totalAmountPaise === 150000, "Order 2 placed: 2x Duck Breast (150000 paise)");

    // Order 3: Device 1 orders Dessert (1x Panna Cotta = ₹290 = 29000 paise) -> will be cancelled
    const ord3Res = await fetch(orderSubmitUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CONVEX_SERVER_SECRET}`,
      },
      body: JSON.stringify({
        rawCustomerWriteToken: dev1Write,
        items: [{ menuItemId: itemDessert.menuItemId, quantity: 1 }],
        customerName: "Ananya",
        idempotencyKey: `p34-ord3-${Date.now()}`,
      }),
    });
    const ord3Data = (await ord3Res.json()) as { orderId: Id<"orders">; totalAmountPaise: number };
    assert(ord3Res.status === 200 && ord3Data.totalAmountPaise === 29000, "Order 3 placed: 1x Panna Cotta (29000 paise)");

    // Advance Order 1: NEW -> PREPARING -> DELIVERED
    client.setAuth(staffToken);
    await client.mutation(api.kitchen.updateOrderStatus, {
      orderId: ord1Data.orderId,
      targetStatus: "PREPARING",
    });
    await client.mutation(api.kitchen.updateOrderStatus, {
      orderId: ord1Data.orderId,
      targetStatus: "DELIVERED",
    });

    // Advance Order 2: NEW -> PREPARING (Still preparing!)
    await client.mutation(api.kitchen.updateOrderStatus, {
      orderId: ord2Data.orderId,
      targetStatus: "PREPARING",
    });

    // Cancel Order 3: NEW -> CANCELLED
    await client.mutation(api.kitchen.updateOrderStatus, {
      orderId: ord3Data.orderId,
      targetStatus: "CANCELLED",
      cancellationReason: "Diner decided against dessert",
    });

    // Staff queries Running Bill
    const staffBill = await client.query(api.billing.getTableSessionBill, {
      tableOrderSessionId: scan1Data.tableOrderSessionId,
    });

    assert(
      staffBill.deliveredOrders.length === 1 &&
      staffBill.unfinishedOrders.length === 1 &&
      staffBill.cancelledOrders.length === 1,
      "Bill Segregation: Delivered (1), Unfinished (1), and Cancelled (1) orders accurately grouped"
    );

    assert(
      staffBill.payableAmountPaise === 76000 &&
      staffBill.pendingAmountPaise === 150000 &&
      staffBill.cancelledAmountPaise === 29000,
      "Monetary Integrity: Payable (₹760), Pending (₹1500), Cancelled (₹290 excluded) calculated in paise"
    );

    assert(
      staffBill.isReadyForClosure === false && staffBill.unfinishedOrderCount === 1,
      "Closure Gate: isReadyForClosure is FALSE while Order 2 is PREPARING"
    );

    // Customer queries Running Bill via reactive capability query
    client.clearAuth();
    const customerBill = await client.query(api.billing.getCustomerTableBill, {
      customerScanSessionId: scan1Data.customerScanSessionId,
      rawReadCapabilityToken: dev1Read,
    });

    assert(
      customerBill.tableNumber === 6 &&
      customerBill.payableAmountPaise === 76000 &&
      customerBill.pendingAmountPaise === 150000,
      "Customer Bill View: Diner receives real-time authoritative bill breakdown"
    );

    console.log("\n--- GROUP F.2: UNFINISHED ORDER CLOSURE PROTECTION ---");

    // Test F2.1: Anonymous caller denied settlement
    let anonSettleRejected = false;
    try {
      await client.mutation(api.billing.settleAndCloseTableSession, {
        tableOrderSessionId: scan1Data.tableOrderSessionId,
        paymentMethod: "UPI",
      });
    } catch (err: unknown) {
      anonSettleRejected = getErrorMessage(err).includes("UNAUTHENTICATED");
    }
    assert(anonSettleRejected, "Security Guard: Anonymous caller denied settleAndCloseTableSession (UNAUTHENTICATED)");

    // Test F2.2: Staff attempts closure while Order 2 is PREPARING -> MUST BE BLOCKED
    client.setAuth(staffToken);
    let unfinishedBlocked = false;
    try {
      await client.mutation(api.billing.settleAndCloseTableSession, {
        tableOrderSessionId: scan1Data.tableOrderSessionId,
        paymentMethod: "UPI",
      });
    } catch (err: unknown) {
      unfinishedBlocked = getErrorMessage(err).includes("UNFINISHED_ORDERS_EXIST");
    }
    assert(
      unfinishedBlocked,
      "Unfinished Order Protection: Settlement BLOCKED while kitchen has unfinished orders (UNFINISHED_ORDERS_EXIST)"
    );

    console.log("\n--- GROUP F.3: PAYMENT SETTLEMENT & ATOMIC TABLE CLOSURE ---");

    // Create an active service request at Table 6 to verify automatic closure resolution
    const serviceReqUrl = `${CONVEX_SITE_URL}/server/service-requests/create`;
    const callStaffRes = await fetch(serviceReqUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CONVEX_SERVER_SECRET}`,
      },
      body: JSON.stringify({
        rawCustomerWriteToken: dev1Write,
        requestType: "REQUEST_BILL",
        note: "Ready for payment via UPI",
      }),
    });
    assert(callStaffRes.status === 200, "Customer submitted REQUEST_BILL service request");

    // Finish preparation for Order 2: PREPARING -> DELIVERED
    await client.mutation(api.kitchen.updateOrderStatus, {
      orderId: ord2Data.orderId,
      targetStatus: "DELIVERED",
    });

    // Check Bill: Now both orders are delivered (76000 + 150000 = 226000 paise = ₹2,260.00)
    const billReady = await client.query(api.billing.getTableSessionBill, {
      tableOrderSessionId: scan1Data.tableOrderSessionId,
    });
    assert(
      billReady.isReadyForClosure === true &&
      billReady.payableAmountPaise === 226000 &&
      billReady.unfinishedOrderCount === 0,
      "Settlement Readiness: isReadyForClosure is TRUE with ₹2,260.00 (226000 paise) total"
    );

    // Test F3.1: Staff executes atomic payment settlement via UPI
    const settleResult = await client.mutation(api.billing.settleAndCloseTableSession, {
      tableOrderSessionId: scan1Data.tableOrderSessionId,
      paymentMethod: "UPI",
      paymentReference: "UPI-REF-9876543210-TEST",
    });

    assert(
      settleResult.success &&
      settleResult.finalBillAmountPaise === 226000 &&
      settleResult.paymentMethod === "UPI" &&
      settleResult.paidOrdersCount === 2,
      "Atomic Settlement: Staff successfully confirmed ₹2,260.00 UPI payment settlement",
      `Settled by: ${settleResult.closedBy}`
    );

    // Test F3.2: Verify delivered orders transitioned to PAID
    client.setAuth(staffToken);
    const closedBill = await client.query(api.billing.getTableSessionBill, {
      tableOrderSessionId: scan1Data.tableOrderSessionId,
    });
    const paidTickets = closedBill.deliveredOrders.filter((o) => o.status === "PAID");
    assert(
      paidTickets.length === 2,
      "Order State Transition: Both delivered order tickets atomically marked PAID"
    );

    // Test F3.3: Verify active service requests were resolved
    const activeRequests = await client.query(api.service_requests.getActiveServiceRequests, {});
    const openForTable6 = activeRequests.filter((r) => r.tableNumber === 6);
    assert(
      openForTable6.length === 0,
      "Service Request Lifecycle: All open service requests for Table 6 atomically marked RESOLVED upon closure"
    );

    // Test F3.4: Verify customer scan sessions were revoked (both read and write)
    client.clearAuth();
    let customerReadRevoked = false;
    try {
      await client.query(api.orders.getCustomerTableOrders, {
        customerScanSessionId: scan1Data.customerScanSessionId,
        rawReadCapabilityToken: dev1Read,
      });
    } catch (err: unknown) {
      customerReadRevoked = getErrorMessage(err).includes("UNAUTHORIZED");
    }
    assert(
      customerReadRevoked,
      "Customer Read Revocation: Diner read capability token revoked upon closure (UNAUTHORIZED)"
    );

    // Attempting to place an order using the revoked write token must fail
    const revokedOrderRes = await fetch(orderSubmitUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CONVEX_SERVER_SECRET}`,
      },
      body: JSON.stringify({
        rawCustomerWriteToken: dev1Write,
        items: [{ menuItemId: itemStarter.menuItemId, quantity: 1 }],
      }),
    });
    const revokedData = (await revokedOrderRes.json()) as { error?: string };
    assert(
      revokedOrderRes.status === 400 &&
      Boolean(revokedData.error?.includes("UNAUTHORIZED") || revokedData.error?.includes("SESSION_CLOSED")),
      "Customer Write Revocation: Customer ordering against settled/closed session strictly REJECTED"
    );

    // Test F3.5: Reject duplicate settlement
    client.setAuth(staffToken);
    let duplicateSettleRejected = false;
    try {
      await client.mutation(api.billing.settleAndCloseTableSession, {
        tableOrderSessionId: scan1Data.tableOrderSessionId,
        paymentMethod: "CASH",
      });
    } catch (err: unknown) {
      duplicateSettleRejected = getErrorMessage(err).includes("SESSION_ALREADY_CLOSED");
    }
    assert(
      duplicateSettleRejected,
      "Duplicate Settlement Guard: Re-settling closed session REJECTED (SESSION_ALREADY_CLOSED)"
    );

    console.log("\n--- GROUP F.4: SUBSEQUENT CUSTOMER SESSION RE-INITIALIZATION ---");

    // Test F4.1: Subsequent dining party scans Table 6 stand QR
    const nextPartyWrite = crypto.randomBytes(32).toString("hex");
    const nextPartyRead = crypto.randomBytes(32).toString("hex");

    const newScanRes = await fetch(resolveScanUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CONVEX_SERVER_SECRET}`,
      },
      body: JSON.stringify({
        tableSlug: "table-6",
        qrToken: t6StandSecret,
        rawCustomerWriteToken: nextPartyWrite,
        rawReadCapabilityToken: nextPartyRead,
      }),
    });
    const newScanData = (await newScanRes.json()) as {
      tableOrderSessionId: Id<"tableOrderSessions">;
      customerScanSessionId: Id<"customerScanSessions">;
    };

    assert(
      newScanRes.status === 200 && newScanData.tableOrderSessionId !== scan1Data.tableOrderSessionId,
      "New Party Ingestion: Subsequent diner at Table 6 assigned a FRESH active table session",
      `New Session ID: ${newScanData.tableOrderSessionId}`
    );

    // Test F4.2: New session starts with clean empty bill
    client.clearAuth();
    const newPartyBill = await client.query(api.billing.getCustomerTableBill, {
      customerScanSessionId: newScanData.customerScanSessionId,
      rawReadCapabilityToken: nextPartyRead,
    });

    assert(
      newPartyBill.tableNumber === 6 &&
      newPartyBill.sessionStatus === "ACTIVE" &&
      newPartyBill.payableAmountPaise === 0 &&
      newPartyBill.deliveredOrders.length === 0,
      "Clean Bill State: Fresh table session initializes with clean zero balance and active status"
    );

    console.log("\n--- GROUP F.5: CASH PAYMENT SETTLEMENT TEST ---");

    // New party places 1 item (1x Duck = 75000 paise)
    const newPartyOrderRes = await fetch(orderSubmitUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CONVEX_SERVER_SECRET}`,
      },
      body: JSON.stringify({
        rawCustomerWriteToken: nextPartyWrite,
        items: [{ menuItemId: itemMain.menuItemId, quantity: 1 }],
        customerName: "Karan",
        idempotencyKey: `p34-cash-${Date.now()}`,
      }),
    });
    const newPartyOrderData = (await newPartyOrderRes.json()) as { orderId: Id<"orders"> };

    // Deliver order
    client.setAuth(staffToken);
    await client.mutation(api.kitchen.updateOrderStatus, {
      orderId: newPartyOrderData.orderId,
      targetStatus: "PREPARING",
    });
    await client.mutation(api.kitchen.updateOrderStatus, {
      orderId: newPartyOrderData.orderId,
      targetStatus: "DELIVERED",
    });

    // Settle with CASH
    const cashSettleResult = await client.mutation(api.billing.settleAndCloseTableSession, {
      tableOrderSessionId: newScanData.tableOrderSessionId,
      paymentMethod: "CASH",
    });

    assert(
      cashSettleResult.success &&
      cashSettleResult.paymentMethod === "CASH" &&
      cashSettleResult.finalBillAmountPaise === 75000,
      "Cash Settlement: Staff successfully confirmed ₹750.00 CASH payment settlement"
    );

    console.log("\n==================================================================");
    console.log(`  PHASE 3.4 TEST SUITE RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
    console.log("==================================================================");

    if (failedCount > 0) {
      process.exit(1);
    }
  } catch (fatalError: unknown) {
    console.error("FATAL TEST SUITE ERROR:", fatalError);
    process.exit(1);
  }
}

void runPhase34Tests();
