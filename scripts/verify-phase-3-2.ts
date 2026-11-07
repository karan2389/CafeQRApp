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
console.log("  COURISTA — PHASE 3.2 VERIFICATION SUITE                         ");
console.log("  Group C: Customer Order Placement & Tamper-Proof Pricing        ");
console.log("  Customer Order Tracking & Cross-Table Isolation                 ");
console.log("  Group E: Customer Service Requests & Staff Workflow             ");
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

async function runPhase32Tests() {
  try {
    console.log("\n--- 0. AUTHENTICATION BOOTSTRAP ---");

    // 1. Admin login credentials
    const adminEmail = `admin-p32-${Date.now()}@courista.test`;
    const adminPass = "SecureAdminP32!#2026";
    const adminSignup = await client.action(api.auth.signIn, {
      provider: "password",
      params: {
        email: adminEmail,
        password: adminPass,
        name: "Phase 3.2 Admin Overseer",
        role: "admin",
        flow: "signUp",
      },
    });
    const adminToken = adminSignup!.tokens!.token;
    assert(Boolean(adminToken), "Admin bootstrap authentication token acquired");

    // 2. Staff login credentials
    const staffEmail = `staff-p32-${Date.now()}@courista.test`;
    const staffPass = "KitchenStaffP32!#2026";
    const staffSignup = await client.action(api.auth.signIn, {
      provider: "password",
      params: {
        email: staffEmail,
        password: staffPass,
        name: "Phase 3.2 Floor Server",
        role: "kitchen_staff",
        flow: "signUp",
      },
    });
    const staffToken = staffSignup!.tokens!.token;
    assert(Boolean(staffToken), "Staff bootstrap authentication token acquired");

    console.log("\n--- 1. FIXTURE SETUP: TABLES, MENUS & DINING SESSIONS ---");

    client.setAuth(adminToken);

    // Setup Table 6 (Primary Dining Table)
    const t6StandSecret = "table-6-physical-stand-secret-p32";
    const fixture6 = await client.mutation(api.test_helpers.seedTestFixture, {
      tableNumber: 6,
      rawCustomerToken: crypto.randomBytes(32).toString("hex"),
      rawReadCapabilityToken: crypto.randomBytes(32).toString("hex"),
    });
    await client.mutation(api.tables.adminRegenerateTableQrToken, {
      tableId: fixture6.tableId,
      newQrTokenHash: sha256Hex(t6StandSecret),
    });

    // Setup Table 5 (Secondary Dining Table for Cross-Table Isolation Tests)
    const t5StandSecret = "table-5-physical-stand-secret-p32";
    const fixture5 = await client.mutation(api.test_helpers.seedTestFixture, {
      tableNumber: 5,
      rawCustomerToken: crypto.randomBytes(32).toString("hex"),
      rawReadCapabilityToken: crypto.randomBytes(32).toString("hex"),
    });
    await client.mutation(api.tables.adminRegenerateTableQrToken, {
      tableId: fixture5.tableId,
      newQrTokenHash: sha256Hex(t5StandSecret),
    });

    // Setup Category & Menu Items
    const categoryResult = await client.mutation(api.categories.createCategory, {
      name: "Artisan Beverages",
      slug: `artisan-bev-${Date.now()}`,
      displayOrder: 1,
      isActive: true,
    });

    // Available item: Smoked Caramel Latte (₹320.00 = 32000 paise)
    const availableItem = await client.mutation(api.menu.createMenuItem, {
      categoryId: categoryResult.categoryId,
      name: "Smoked Caramel Latte",
      description: "Artisan double espresso with smoked caramel syrup",
      pricePaise: 32000,
      displayOrder: 1,
      isAvailable: true,
    });

    // Unavailable item: Seasonal Berry Scone (isAvailable: false)
    const unavailableItem = await client.mutation(api.menu.createMenuItem, {
      categoryId: categoryResult.categoryId,
      name: "Seasonal Berry Scone",
      description: "Sold out seasonal pastry",
      pricePaise: 18000,
      displayOrder: 2,
      isAvailable: false,
    });

    // Resolve Scan for Device A at Table 6
    const resolveScanUrl = `${CONVEX_SITE_URL}/server/sessions/resolve-scan`;
    const deviceARawWrite = crypto.randomBytes(32).toString("hex");
    const deviceARawRead = crypto.randomBytes(32).toString("hex");

    const scanResA = await fetch(resolveScanUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CONVEX_SERVER_SECRET}`,
      },
      body: JSON.stringify({
        tableSlug: "table-6",
        qrToken: t6StandSecret,
        rawCustomerWriteToken: deviceARawWrite,
        rawReadCapabilityToken: deviceARawRead,
      }),
    });
    const scanDataA = (await scanResA.json()) as {
      tableOrderSessionId: Id<"tableOrderSessions">;
      customerScanSessionId: Id<"customerScanSessions">;
    };
    assert(
      scanResA.status === 200 && Boolean(scanDataA.tableOrderSessionId),
      "Scan Resolution: Device A connected to Table 6 active session",
      `Session ID: ${scanDataA.tableOrderSessionId}`
    );

    // Resolve Scan for Device B at Table 6 (Different diner, same table)
    const deviceBRawWrite = crypto.randomBytes(32).toString("hex");
    const deviceBRawRead = crypto.randomBytes(32).toString("hex");

    const scanResB = await fetch(resolveScanUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CONVEX_SERVER_SECRET}`,
      },
      body: JSON.stringify({
        tableSlug: "table-6",
        qrToken: t6StandSecret,
        rawCustomerWriteToken: deviceBRawWrite,
        rawReadCapabilityToken: deviceBRawRead,
      }),
    });
    const scanDataB = (await scanResB.json()) as {
      tableOrderSessionId: Id<"tableOrderSessions">;
      customerScanSessionId: Id<"customerScanSessions">;
    };
    assert(
      scanResB.status === 200 && scanDataB.tableOrderSessionId === scanDataA.tableOrderSessionId,
      "Multi-Device Alignment: Device B joined the identical Table 6 dining session"
    );

    // Resolve Scan for Device C at Table 5 (Different table diner)
    const deviceCRawWrite = crypto.randomBytes(32).toString("hex");
    const deviceCRawRead = crypto.randomBytes(32).toString("hex");

    const scanResC = await fetch(resolveScanUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CONVEX_SERVER_SECRET}`,
      },
      body: JSON.stringify({
        tableSlug: "table-5",
        qrToken: t5StandSecret,
        rawCustomerWriteToken: deviceCRawWrite,
        rawReadCapabilityToken: deviceCRawRead,
      }),
    });
    const scanDataC = (await scanResC.json()) as {
      tableOrderSessionId: Id<"tableOrderSessions">;
      customerScanSessionId: Id<"customerScanSessions">;
    };
    assert(
      scanResC.status === 200 && scanDataC.tableOrderSessionId !== scanDataA.tableOrderSessionId,
      "Cross-Table Isolation: Device C connected to independent Table 5 session"
    );

    console.log("\n--- GROUP C.1: CUSTOMER ORDER PLACEMENT & PRICE INTEGRITY ---");

    const orderSubmitUrl = `${CONVEX_SITE_URL}/server/orders/submit`;

    // Test C1.1: Direct call without server secret REJECTED (HTTP 401)
    const noAuthOrderRes = await fetch(orderSubmitUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rawCustomerWriteToken: deviceARawWrite,
        items: [{ menuItemId: availableItem.menuItemId, quantity: 1 }],
      }),
    });
    assert(noAuthOrderRes.status === 401, "Gatekeeper: Unauthenticated order submission REJECTED (HTTP 401)");

    // Test C1.2: Empty order payload REJECTED (HTTP 400)
    const emptyOrderRes = await fetch(orderSubmitUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CONVEX_SERVER_SECRET}`,
      },
      body: JSON.stringify({
        rawCustomerWriteToken: deviceARawWrite,
        items: [],
      }),
    });
    const emptyData = (await emptyOrderRes.json()) as { error?: string };
    assert(
      emptyOrderRes.status === 400 && Boolean(emptyData.error?.includes("EMPTY_ORDER")),
      "Input Validation: Empty order payload REJECTED (EMPTY_ORDER)"
    );

    // Test C1.3: Invalid item quantity REJECTED (quantity = 0 or fractional)
    const invalidQtyRes = await fetch(orderSubmitUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CONVEX_SERVER_SECRET}`,
      },
      body: JSON.stringify({
        rawCustomerWriteToken: deviceARawWrite,
        items: [{ menuItemId: availableItem.menuItemId, quantity: 0 }],
      }),
    });
    const invalidQtyData = (await invalidQtyRes.json()) as { error?: string };
    assert(
      invalidQtyRes.status === 400 && Boolean(invalidQtyData.error?.includes("INVALID_QUANTITY")),
      "Money & Quantity Integrity: Zero quantity order REJECTED (INVALID_QUANTITY)"
    );

    // Test C1.4: Unavailable menu item REJECTED
    const unavailableRes = await fetch(orderSubmitUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CONVEX_SERVER_SECRET}`,
      },
      body: JSON.stringify({
        rawCustomerWriteToken: deviceARawWrite,
        items: [{ menuItemId: unavailableItem.menuItemId, quantity: 1 }],
      }),
    });
    const unavailData = (await unavailableRes.json()) as { error?: string };
    assert(
      unavailableRes.status === 400 && Boolean(unavailData.error?.includes("ITEM_UNAVAILABLE")),
      "Kitchen Inventory Guard: Ordering 86'd/unavailable item REJECTED (ITEM_UNAVAILABLE)"
    );

    // Test C1.5: Client price manipulation attempt REJECTED
    // 2x Smoked Caramel Latte = ₹640 (64000 paise). Client claims ₹1 (100 paise).
    const priceTamperRes = await fetch(orderSubmitUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CONVEX_SERVER_SECRET}`,
      },
      body: JSON.stringify({
        rawCustomerWriteToken: deviceARawWrite,
        items: [{ menuItemId: availableItem.menuItemId, quantity: 2 }],
        clientClaimedTotalPaise: 100, // Forged client price!
      }),
    });
    const tamperData = (await priceTamperRes.json()) as { error?: string };
    assert(
      priceTamperRes.status === 400 && Boolean(tamperData.error?.includes("PRICE_MANIPULATION_DETECTED")),
      "Security Enforcement: Client price manipulation attempt REJECTED (PRICE_MANIPULATION_DETECTED)"
    );

    // Test C1.6: Valid order placement by Device A
    const validOrderAIdempotency = `order-idemp-${Date.now()}-A`;
    const validOrderARes = await fetch(orderSubmitUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CONVEX_SERVER_SECRET}`,
      },
      body: JSON.stringify({
        rawCustomerWriteToken: deviceARawWrite,
        items: [
          {
            menuItemId: availableItem.menuItemId,
            quantity: 2,
            customizationNotes: "Extra oat milk, less ice",
          },
        ],
        customerName: "Aarav (Table 6 Seat 1)",
        orderNotes: "Serve together please",
        idempotencyKey: validOrderAIdempotency,
      }),
    });

    assert(validOrderARes.status === 200, "Order Placement: Device A placed legitimate customer order (HTTP 200)");
    const validOrderAData = (await validOrderARes.json()) as {
      orderId: Id<"orders">;
      orderNumber: string;
      totalAmountPaise: number;
      status: string;
      isDuplicateReplay: boolean;
    };
    assert(
      validOrderAData.totalAmountPaise === 64000 && validOrderAData.status === "NEW",
      "Authoritative Calculation: Total accurately calculated as 64000 paise (₹640.00)",
      `Order: ${validOrderAData.orderNumber}`
    );

    // Test C1.7: Duplicate submission replay with Idempotency Key
    const replayRes = await fetch(orderSubmitUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CONVEX_SERVER_SECRET}`,
      },
      body: JSON.stringify({
        rawCustomerWriteToken: deviceARawWrite,
        items: [{ menuItemId: availableItem.menuItemId, quantity: 2 }],
        idempotencyKey: validOrderAIdempotency, // Same key!
      }),
    });
    const replayData = (await replayRes.json()) as {
      orderId: Id<"orders">;
      isDuplicateReplay: boolean;
    };
    assert(
      replayRes.status === 200 &&
      replayData.orderId === validOrderAData.orderId &&
      replayData.isDuplicateReplay === true,
      "Idempotency Protection: Duplicate submission replayed safely with zero duplicate tickets"
    );

    console.log("\n--- GROUP C.2: MULTI-DEVICE ORDERING & CONCURRENCY ---");

    // Test C2.1: Device B (different diner at Table 6) places order
    const validOrderBRes = await fetch(orderSubmitUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CONVEX_SERVER_SECRET}`,
      },
      body: JSON.stringify({
        rawCustomerWriteToken: deviceBRawWrite,
        items: [{ menuItemId: availableItem.menuItemId, quantity: 1 }],
        customerName: "Priya (Table 6 Seat 2)",
        idempotencyKey: `order-idemp-${Date.now()}-B`,
      }),
    });
    const validOrderBData = (await validOrderBRes.json()) as {
      orderId: Id<"orders">;
      totalAmountPaise: number;
    };
    assert(
      validOrderBRes.status === 200 && validOrderBData.totalAmountPaise === 32000,
      "Multi-Device Dining: Second diner at Table 6 placed concurrent order (32000 paise)"
    );

    // Test C2.2: 4 simultaneous orders placed concurrently at Table 6
    const concurrentOrderPromises = Array.from({ length: 4 }).map((_, idx) =>
      fetch(orderSubmitUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${CONVEX_SERVER_SECRET}`,
        },
        body: JSON.stringify({
          rawCustomerWriteToken: idx % 2 === 0 ? deviceARawWrite : deviceBRawWrite,
          items: [{ menuItemId: availableItem.menuItemId, quantity: 1 }],
          idempotencyKey: `concurrent-burst-${Date.now()}-${idx}`,
        }),
      }).then((r) => r.json() as Promise<{ orderId: Id<"orders">; totalAmountPaise: number }>)
    );

    const concurrentResults = await Promise.all(concurrentOrderPromises);
    const allSucceeded = concurrentResults.every((r) => Boolean(r.orderId && r.totalAmountPaise === 32000));
    assert(
      allSucceeded,
      "Concurrency & OCC: 4 simultaneous orders placed concurrently and committed cleanly"
    );

    console.log("\n--- GROUP C.3: SESSION EXPIRY, REVOCATION & CLOSURE GUARDS ---");

    // Setup temporary session for expiry test
    const tempWriteToken = crypto.randomBytes(32).toString("hex");
    const tempReadToken = crypto.randomBytes(32).toString("hex");
    const tempScanRes = await fetch(resolveScanUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CONVEX_SERVER_SECRET}`,
      },
      body: JSON.stringify({
        tableSlug: "table-6",
        qrToken: t6StandSecret,
        rawCustomerWriteToken: tempWriteToken,
        rawReadCapabilityToken: tempReadToken,
      }),
    });
    const tempScanData = (await tempScanRes.json()) as {
      customerScanSessionId: Id<"customerScanSessions">;
    };

    // Test C3.1: Expired session rejected
    client.setAuth(adminToken);
    await client.mutation(api.sessions.internalSetCustomerSessionState, {
      customerScanSessionId: tempScanData.customerScanSessionId,
      isActive: true,
      isExpired: true,
      isRevoked: false,
    });

    const expiredOrderRes = await fetch(orderSubmitUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CONVEX_SERVER_SECRET}`,
      },
      body: JSON.stringify({
        rawCustomerWriteToken: tempWriteToken,
        items: [{ menuItemId: availableItem.menuItemId, quantity: 1 }],
      }),
    });
    const expiredData = (await expiredOrderRes.json()) as { error?: string };
    assert(
      expiredOrderRes.status === 400 && Boolean(expiredData.error?.includes("SESSION_EXPIRED")),
      "Lifecycle Guard: Order submitted with expired session REJECTED (SESSION_EXPIRED)"
    );

    // Test C3.2: Revoked session rejected
    client.setAuth(staffToken);
    await client.mutation(api.sessions.revokeCustomerScanSession, {
      customerScanSessionId: tempScanData.customerScanSessionId,
    });

    const revokedOrderRes = await fetch(orderSubmitUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CONVEX_SERVER_SECRET}`,
      },
      body: JSON.stringify({
        rawCustomerWriteToken: tempWriteToken,
        items: [{ menuItemId: availableItem.menuItemId, quantity: 1 }],
      }),
    });
    const revokedData = (await revokedOrderRes.json()) as { error?: string };
    assert(
      revokedOrderRes.status === 400 && Boolean(revokedData.error?.includes("UNAUTHORIZED")),
      "Lifecycle Guard: Order submitted with revoked session REJECTED (UNAUTHORIZED)"
    );

    // Test C3.3: Order against closed table session rejected
    // Close Table 5 session using staff helper
    client.setAuth(staffToken);
    await client.mutation(api.test_helpers.testCloseTableSession, {
      tableOrderSessionId: scanDataC.tableOrderSessionId,
      paymentMethod: "UPI",
    });

    const closedTableOrderRes = await fetch(orderSubmitUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CONVEX_SERVER_SECRET}`,
      },
      body: JSON.stringify({
        rawCustomerWriteToken: deviceCRawWrite,
        items: [{ menuItemId: availableItem.menuItemId, quantity: 1 }],
      }),
    });
    const closedTableData = (await closedTableOrderRes.json()) as { error?: string };
    assert(
      closedTableOrderRes.status === 400 && Boolean(closedTableData.error?.includes("SESSION_CLOSED")),
      "Settlement Guard: Order submitted against settled/closed table session REJECTED (SESSION_CLOSED)"
    );

    console.log("\n--- GROUP C.4: CUSTOMER ORDER TRACKING & TABLE ISOLATION ---");

    client.clearAuth();

    // Test CT4.1: Reactive query getCustomerTableOrders
    const table6Orders = await client.query(api.orders.getCustomerTableOrders, {
      customerScanSessionId: scanDataA.customerScanSessionId,
      rawReadCapabilityToken: deviceARawRead,
    });

    assert(
      table6Orders.tableNumber === 6 && table6Orders.orders.length >= 6,
      "Customer Order Stream: Diners at Table 6 receive all cumulative table orders in real time",
      `Total table balance: ₹${table6Orders.totalTableAmountPaise / 100}`
    );

    // Test CT4.2: Device ownership identification (isCurrentDevice)
    const deviceAOrder = table6Orders.orders.find((o) => o._id === validOrderAData.orderId);
    const deviceBOrder = table6Orders.orders.find((o) => o._id === validOrderBData.orderId);
    assert(
      Boolean(deviceAOrder?.isCurrentDevice === true && deviceBOrder?.isCurrentDevice === false),
      "Device Scoping: Table orders distinguish between current device orders vs co-diner orders"
    );

    // Test CT4.3: Immutable snapshot verification
    const snapshotItem = deviceAOrder?.items[0];
    assert(
      snapshotItem?.itemName === "Smoked Caramel Latte" &&
      snapshotItem?.unitPricePaise === 32000 &&
      snapshotItem?.quantity === 2 &&
      snapshotItem?.itemTotalPaise === 64000 &&
      snapshotItem?.customizationNotes === "Extra oat milk, less ice",
      "Financial Immutability: Order line item snapshot precisely preserved with custom notes"
    );

    // Test CT4.4: Single order detail query getCustomerOrderById
    const singleOrder = await client.query(api.orders.getCustomerOrderById, {
      customerScanSessionId: scanDataA.customerScanSessionId,
      rawReadCapabilityToken: deviceARawRead,
      orderId: validOrderAData.orderId,
    });
    assert(
      singleOrder._id === validOrderAData.orderId && singleOrder.totalAmountPaise === 64000,
      "Single Order Query: Diner successfully queried specific order ticket detail"
    );

    // Test CT4.5: Cross-table data leakage prevention
    // Device C (Table 5) attempts to inspect Table 6's order
    let crossTableOrderRejected = false;
    try {
      await client.query(api.orders.getCustomerOrderById, {
        customerScanSessionId: scanDataC.customerScanSessionId,
        rawReadCapabilityToken: deviceCRawRead,
        orderId: validOrderAData.orderId, // Table 6's order!
      });
    } catch (err: unknown) {
      crossTableOrderRejected = getErrorMessage(err).includes("UNAUTHORIZED");
    }
    assert(
      crossTableOrderRejected,
      "Cross-Table Isolation: Diner at Table 5 strictly FORBIDDEN from inspecting Table 6's order (UNAUTHORIZED)"
    );

    console.log("\n--- GROUP E.1: CUSTOMER SERVICE REQUESTS (CALL STAFF / ASSISTANCE) ---");

    const serviceReqUrl = `${CONVEX_SITE_URL}/server/service-requests/create`;

    // Test E1.1: Valid Call Staff request creation
    const callStaffRes = await fetch(serviceReqUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CONVEX_SERVER_SECRET}`,
      },
      body: JSON.stringify({
        rawCustomerWriteToken: deviceARawWrite,
        requestType: "CALL_STAFF",
        note: "Need water glasses for 3 people",
      }),
    });
    assert(callStaffRes.status === 200, "Service Request Creation: Diner successfully called staff (HTTP 200)");
    const callStaffData = (await callStaffRes.json()) as {
      requestId: Id<"serviceRequests">;
      status: string;
      tableNumber: number;
    };
    assert(
      Boolean(callStaffData.requestId && callStaffData.status === "OPEN" && callStaffData.tableNumber === 6),
      "Service Request State: Request initialized in OPEN status for Table 6"
    );

    // Test E1.2: Duplicate active request prevention (same type while open)
    const duplicateCallRes = await fetch(serviceReqUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CONVEX_SERVER_SECRET}`,
      },
      body: JSON.stringify({
        rawCustomerWriteToken: deviceARawWrite,
        requestType: "CALL_STAFF",
      }),
    });
    const dupCallData = (await duplicateCallRes.json()) as { error?: string };
    assert(
      duplicateCallRes.status === 400 && Boolean(dupCallData.error?.includes("ACTIVE_REQUEST_EXISTS")),
      "Anti-Spam Guard: Duplicate active Call Staff request REJECTED (ACTIVE_REQUEST_EXISTS)"
    );

    // Test E1.3: Cooldown enforcement across different request types
    const cooldownRes = await fetch(serviceReqUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CONVEX_SERVER_SECRET}`,
      },
      body: JSON.stringify({
        rawCustomerWriteToken: deviceARawWrite,
        requestType: "REQUEST_BILL",
      }),
    });
    const cooldownData = (await cooldownRes.json()) as { error?: string };
    assert(
      cooldownRes.status === 400 && Boolean(cooldownData.error?.includes("COOLDOWN_ACTIVE")),
      "Cooldown Guard: Rapid consecutive request across different types REJECTED (COOLDOWN_ACTIVE)"
    );

    // Test E1.4: Realtime customer tracking of service requests
    client.clearAuth();
    const customerRequests = await client.query(api.service_requests.getCustomerServiceRequests, {
      customerScanSessionId: scanDataA.customerScanSessionId,
      rawReadCapabilityToken: deviceARawRead,
    });
    assert(
      customerRequests.length > 0 && customerRequests[0]._id === callStaffData.requestId,
      "Customer Request Tracking: Diner can track service request status in real time (OPEN)"
    );

    console.log("\n--- GROUP E.2: STAFF WORKFLOW & REQUEST LIFECYCLE ---");

    // Test E2.1: Unauthorized staff operations rejected
    client.clearAuth();
    let anonAckRejected = false;
    try {
      await client.mutation(api.service_requests.acknowledgeServiceRequest, {
        requestId: callStaffData.requestId,
      });
    } catch (err: unknown) {
      anonAckRejected = getErrorMessage(err).includes("UNAUTHENTICATED");
    }
    assert(anonAckRejected, "Role Guard: Anonymous caller denied acknowledgeServiceRequest (UNAUTHENTICATED)");

    // Test E2.2: Staff monitors active requests on dining floor
    client.setAuth(staffToken);
    const activeFloorRequests = await client.query(api.service_requests.getActiveServiceRequests, {});
    const targetRequest = activeFloorRequests.find((r) => r._id === callStaffData.requestId);
    assert(
      Boolean(targetRequest && targetRequest.status === "OPEN"),
      "Staff Floor Monitor: Kitchen staff successfully retrieved active table requests"
    );

    // Test E2.3: Staff acknowledges request
    const ackResult = await client.mutation(api.service_requests.acknowledgeServiceRequest, {
      requestId: callStaffData.requestId,
    });
    assert(
      ackResult.success && ackResult.status === "ACKNOWLEDGED",
      "Staff Workflow: Staff successfully acknowledged table service request"
    );

    // Test E2.4: Realtime customer reflection of acknowledgement
    client.clearAuth();
    const ackCustomerRequests = await client.query(api.service_requests.getCustomerServiceRequests, {
      customerScanSessionId: scanDataA.customerScanSessionId,
      rawReadCapabilityToken: deviceARawRead,
    });
    assert(
      ackCustomerRequests.find((r) => r._id === callStaffData.requestId)?.status === "ACKNOWLEDGED",
      "Realtime Reflection: Customer UI instantly updates to ACKNOWLEDGED state"
    );

    // Test E2.5: Staff resolves request
    client.setAuth(staffToken);
    const resolveResult = await client.mutation(api.service_requests.resolveServiceRequest, {
      requestId: callStaffData.requestId,
    });
    assert(
      resolveResult.success && resolveResult.status === "RESOLVED",
      "Staff Workflow: Staff successfully marked service request as RESOLVED"
    );

    // Test E2.6: Realtime customer reflection of resolution
    client.clearAuth();
    const resolvedCustomerRequests = await client.query(api.service_requests.getCustomerServiceRequests, {
      customerScanSessionId: scanDataA.customerScanSessionId,
      rawReadCapabilityToken: deviceARawRead,
    });
    assert(
      resolvedCustomerRequests.find((r) => r._id === callStaffData.requestId)?.status === "RESOLVED",
      "Realtime Reflection: Customer UI instantly updates to RESOLVED state"
    );

    console.log("\n==================================================================");
    console.log(`  PHASE 3.2 TEST SUITE RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
    console.log("==================================================================");

    if (failedCount > 0) {
      process.exit(1);
    }
  } catch (fatalError: unknown) {
    console.error("FATAL TEST SUITE ERROR:", fatalError);
    process.exit(1);
  }
}

void runPhase32Tests();
