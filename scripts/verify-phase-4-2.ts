import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import { Id } from "../convex/_generated/dataModel.js";
import crypto from "crypto";
import fs from "fs";
import path from "path";

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL || "https://outgoing-perch-487.convex.cloud";
const CONVEX_SITE_URL = process.env.NEXT_PUBLIC_CONVEX_SITE_URL || "https://outgoing-perch-487.convex.site";
const CONVEX_SERVER_SECRET = process.env.CONVEX_SERVER_SECRET;

if (!CONVEX_SERVER_SECRET) {
  console.error("FATAL: CONVEX_SERVER_SECRET must be set in environment.");
  process.exit(1);
}

console.log("==================================================================");
console.log("  COURISTA — PHASE 4.2 VERIFICATION SUITE                         ");
console.log("  Kitchen Frontend Integration with Convex                        ");
console.log("==================================================================");
console.log(`Convex Cloud URL: ${CONVEX_URL}`);
console.log(`Convex Site URL:  ${CONVEX_SITE_URL}`);

const anonClient = new ConvexHttpClient(CONVEX_URL);

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

async function runPhase42Tests() {
  try {
    console.log("\n--- 1. AUDIO ASSETS VERIFICATION ---");
    const audioDir = path.join(process.cwd(), "public", "audio", "kitchen");
    assert(fs.existsSync(audioDir), "Kitchen audio directory exists", audioDir);

    const voiceKinds = [
      "new_order",
      "call_staff",
      "request_water",
      "request_bill",
      "request_assistance",
      "pending_order",
      "unanswered_request",
    ];

    let missingAudioCount = 0;
    for (const kind of voiceKinds) {
      for (let table = 1; table <= 6; table++) {
        const file = path.join(audioDir, `${kind}_table_${table}.mp3`);
        if (!fs.existsSync(file)) {
          missingAudioCount++;
        }
      }
    }
    assert(missingAudioCount === 0, "All 42 pre-rendered voice assets exist (7 kinds × 6 tables)");

    console.log("\n--- 2. KITCHEN AUTHENTICATION & ACCESS CONTROL ---");

    // 2.1 Unauthenticated caller rejection
    let unauthQueueThrew = false;
    try {
      await anonClient.query(api.kitchen.getActiveKitchenQueue, {});
    } catch (err) {
      unauthQueueThrew = true;
      assert(
        getErrorMessage(err).includes("UNAUTHENTICATED"),
        "Unauthenticated access to getActiveKitchenQueue is rejected",
        getErrorMessage(err)
      );
    }
    assert(unauthQueueThrew, "Security guard blocks unauthenticated kitchen queue query");

    let unauthMetricsThrew = false;
    try {
      await anonClient.query(api.kitchen.getKitchenMetrics, {});
    } catch (err) {
      unauthMetricsThrew = true;
      assert(
        getErrorMessage(err).includes("UNAUTHENTICATED"),
        "Unauthenticated access to getKitchenMetrics is rejected"
      );
    }
    assert(unauthMetricsThrew, "Security guard blocks unauthenticated kitchen metrics query");

    // 2.2 Kitchen Staff Authentication via Convex Auth
    const staffEmail = `chef-p42-${Date.now()}@courista.test`;
    const staffPass = "KitchenChefP42!#2026";
    const staffSignup = (await anonClient.action(api.auth.signIn, {
      provider: "password",
      params: {
        email: staffEmail,
        password: staffPass,
        name: "Head Chef Marco",
        role: "kitchen_staff",
        flow: "signUp",
      },
    })) as { tokens?: { token?: string } };

    const staffToken = staffSignup?.tokens?.token;
    assert(Boolean(staffToken), "Kitchen staff authentication token issued by Convex Auth");

    const staffClient = new ConvexHttpClient(CONVEX_URL);
    staffClient.setAuth(staffToken!);

    // Verify viewer profile query
    const staffProfile = await staffClient.query(api.users.viewer, {});
    assert(staffProfile?.role === "kitchen_staff", "Viewer profile confirms kitchen_staff role", `Role: ${staffProfile?.role}`);
    assert(staffProfile?.name === "Head Chef Marco", "Viewer profile confirms staff name", `Name: ${staffProfile?.name}`);

    // 2.3 Admin Authentication via Convex Auth
    const adminEmail = `manager-p42-${Date.now()}@courista.test`;
    const adminPass = "ManagerP42!#2026";
    const adminSignup = (await anonClient.action(api.auth.signIn, {
      provider: "password",
      params: {
        email: adminEmail,
        password: adminPass,
        name: "General Manager Sarah",
        role: "admin",
        flow: "signUp",
      },
    })) as { tokens?: { token?: string } };

    const adminToken = adminSignup?.tokens?.token;
    assert(Boolean(adminToken), "Admin authentication token issued by Convex Auth");

    const adminClient = new ConvexHttpClient(CONVEX_URL);
    adminClient.setAuth(adminToken!);

    const adminProfile = await adminClient.query(api.users.viewer, {});
    assert(adminProfile?.role === "admin", "Viewer profile confirms admin role", `Role: ${adminProfile?.role}`);

    // 2.4 Staff access to kitchen queue
    const initialQueue = await staffClient.query(api.kitchen.getActiveKitchenQueue, {});
    assert(Array.isArray(initialQueue.newOrders), "Kitchen staff can query active kitchen queue");
    assert(Array.isArray(initialQueue.preparingOrders), "Queue includes preparing orders");
    assert(Array.isArray(initialQueue.recentDeliveredOrders), "Queue includes recent delivered orders");
    assert(Array.isArray(initialQueue.ordersByTable), "Queue includes orders grouped by table");

    // Admin access to kitchen queue
    const adminQueue = await adminClient.query(api.kitchen.getActiveKitchenQueue, {});
    assert(Array.isArray(adminQueue.newOrders), "Admin can oversee active kitchen queue");

    console.log("\n--- 3. FIXTURE PREPARATION: TABLE 6 & MENU ITEM ---");

    const rawQrStandSecret = "table-6-secret";
    const fixture = await anonClient.mutation(api.test_helpers.seedTestFixture, {
      tableNumber: 6,
      rawCustomerToken: "p42-customer-write-seed",
      rawReadCapabilityToken: "p42-customer-read-seed",
    });
    assert(Boolean(fixture.tableId), "Table 6 fixture initialized", `tableId: ${fixture.tableId}`);

    // Fetch public menu item
    const publicMenu = await anonClient.query(api.menu.getPublicMenu, {});
    const testItem = publicMenu.flatMap((c) => c.items)[0];
    assert(Boolean(testItem && testItem._id), "Test menu item acquired", `Item: ${testItem?.name}`);

    // Create a new diner session on Table 6 via HTTP Action
    const rawCustomerWriteToken = crypto.randomBytes(32).toString("hex");
    const rawReadCapabilityToken = crypto.randomBytes(32).toString("hex");

    const resolveRes = await fetch(`${CONVEX_SITE_URL}/server/sessions/resolve-scan`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CONVEX_SERVER_SECRET}`,
      },
      body: JSON.stringify({
        tableSlug: "table-6",
        qrToken: rawQrStandSecret,
        rawCustomerWriteToken,
        rawReadCapabilityToken,
      }),
    });
    assert(resolveRes.ok, "Customer scan resolved and active session established for Table 6");

    console.log("\n--- 4. LIVE ORDER QUEUE & MULTI-ORDER GROUPING ---");

    // Place Order 1 from Table 6
    const order1Res = await fetch(`${CONVEX_SITE_URL}/server/orders/submit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CONVEX_SERVER_SECRET}`,
      },
      body: JSON.stringify({
        rawCustomerWriteToken,
        items: [{ menuItemId: testItem._id, quantity: 1, customizationNotes: "Extra hot" }],
        customerName: "Alice",
        orderNotes: "Front booth",
        idempotencyKey: `p42-order1-${Date.now()}`,
      }),
    });
    const order1Data = (await order1Res.json()) as { orderId: string; orderNumber: string };
    assert(Boolean(order1Data.orderId), "Customer placed Order 1 for Table 6", `orderNumber: ${order1Data.orderNumber}`);

    // Place Order 2 from Table 6 (different diner at same table)
    const order2Res = await fetch(`${CONVEX_SITE_URL}/server/orders/submit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CONVEX_SERVER_SECRET}`,
      },
      body: JSON.stringify({
        rawCustomerWriteToken,
        items: [{ menuItemId: testItem._id, quantity: 2, customizationNotes: "No sugar" }],
        customerName: "Bob",
        orderNotes: "Same table",
        idempotencyKey: `p42-order2-${Date.now()}`,
      }),
    });
    const order2Data = (await order2Res.json()) as { orderId: string; orderNumber: string };
    assert(Boolean(order2Data.orderId), "Customer placed Order 2 for Table 6", `orderNumber: ${order2Data.orderNumber}`);

    // Query active kitchen queue
    const queueAfterOrders = await staffClient.query(api.kitchen.getActiveKitchenQueue, {});
    const queueOrder1 = queueAfterOrders.newOrders.find((o) => o._id === order1Data.orderId);
    const queueOrder2 = queueAfterOrders.newOrders.find((o) => o._id === order2Data.orderId);

    assert(Boolean(queueOrder1), "Order 1 appears in New Orders queue");
    assert(Boolean(queueOrder2), "Order 2 appears in New Orders queue");
    assert(queueOrder1?.tableNumber === 6 && queueOrder2?.tableNumber === 6, "Both orders are mapped to physical Table 6");

    // Verify multi-order grouping by table
    const table6Group = queueAfterOrders.ordersByTable.find((g) => g.tableNumber === 6);
    assert(Boolean(table6Group), "Table 6 exists in ordersByTable group");
    assert(
      (table6Group?.orders.length ?? 0) >= 2 &&
      Boolean(table6Group?.orders.some((o) => o._id === order1Data.orderId)) &&
      Boolean(table6Group?.orders.some((o) => o._id === order2Data.orderId)),
      "Separate orders from Table 6 are grouped under Table 6 while remaining distinct orders",
      `Grouped count: ${table6Group?.orders.length}`
    );

    // Verify order item details and notes
    assert(queueOrder1?.items[0].customizationNotes === "Extra hot", "Order 1 custom notes preserved");
    assert(queueOrder2?.items[0].customizationNotes === "No sugar", "Order 2 custom notes preserved");
    assert(typeof queueOrder1?.elapsedSeconds === "number" && queueOrder1.elapsedSeconds >= 0, "Elapsed preparation seconds computed");

    console.log("\n--- 5. ORDER STATUS TRANSITION WORKFLOW ---");

    const order1Id = order1Data.orderId as Id<"orders">;
    const order2Id = order2Data.orderId as Id<"orders">;

    // 5.1 Invalid transition test: NEW -> DELIVERED (must fail)
    let invalidTransitionThrew = false;
    try {
      await staffClient.mutation(api.kitchen.updateOrderStatus, {
        orderId: order1Id,
        targetStatus: "DELIVERED",
      });
    } catch (err) {
      invalidTransitionThrew = true;
      assert(
        getErrorMessage(err).includes("INVALID_STATUS_TRANSITION"),
        "Illegal transition NEW -> DELIVERED is rejected by state machine",
        getErrorMessage(err)
      );
    }
    assert(invalidTransitionThrew, "State machine prevents skipping preparation");

    // 5.2 Valid transition: NEW -> PREPARING
    const prepResult = await staffClient.mutation(api.kitchen.updateOrderStatus, {
      orderId: order1Id,
      targetStatus: "PREPARING",
    });
    assert(prepResult.newStatus === "PREPARING", "Order 1 moved NEW -> PREPARING", `Status: ${prepResult.newStatus}`);

    // Duplicate transition test: PREPARING -> PREPARING (must fail)
    let dupTransitionThrew = false;
    try {
      await staffClient.mutation(api.kitchen.updateOrderStatus, {
        orderId: order1Id,
        targetStatus: "PREPARING",
      });
    } catch (err) {
      dupTransitionThrew = true;
      assert(
        getErrorMessage(err).includes("NO_STATUS_CHANGE"),
        "Duplicate status update is safely rejected"
      );
    }
    assert(dupTransitionThrew, "State machine rejects duplicate transition");

    // Verify queue reflects PREPARING
    const queueAfterPrep = await staffClient.query(api.kitchen.getActiveKitchenQueue, {});
    assert(!queueAfterPrep.newOrders.some((o) => o._id === order1Id), "Order 1 removed from New Orders queue");
    assert(queueAfterPrep.preparingOrders.some((o) => o._id === order1Id), "Order 1 appears in Preparing Orders queue");

    // 5.3 Valid transition: PREPARING -> DELIVERED
    const deliverResult = await staffClient.mutation(api.kitchen.updateOrderStatus, {
      orderId: order1Id,
      targetStatus: "DELIVERED",
    });
    assert(deliverResult.newStatus === "DELIVERED", "Order 1 marked PREPARING -> DELIVERED", `Status: ${deliverResult.newStatus}`);

    // Verify queue reflects recentDeliveredOrders (2-hour sliding window)
    const queueAfterDeliver = await staffClient.query(api.kitchen.getActiveKitchenQueue, {});
    assert(!queueAfterDeliver.preparingOrders.some((o) => o._id === order1Id), "Order 1 removed from Preparing queue");
    assert(queueAfterDeliver.recentDeliveredOrders.some((o) => o._id === order1Id), "Order 1 appears in recentDeliveredOrders queue");

    // Terminal state protection: DELIVERED -> PREPARING (must fail)
    let backwardsTransitionThrew = false;
    try {
      await staffClient.mutation(api.kitchen.updateOrderStatus, {
        orderId: order1Id,
        targetStatus: "PREPARING",
      });
    } catch (err) {
      backwardsTransitionThrew = true;
      assert(
        getErrorMessage(err).includes("INVALID_STATUS_TRANSITION"),
        "Delivered order cannot be moved backwards to Preparing"
      );
    }
    assert(backwardsTransitionThrew, "Delivered status remains terminal for kitchen");

    // 5.4 Order Cancellation: NEW -> CANCELLED
    const cancelResult = await staffClient.mutation(api.kitchen.updateOrderStatus, {
      orderId: order2Id,
      targetStatus: "CANCELLED",
      cancellationReason: "Out of specialty syrup",
    });
    assert(cancelResult.newStatus === "CANCELLED", "Order 2 successfully cancelled with reason", `Reason: "Out of specialty syrup"`);

    const queueAfterCancel = await staffClient.query(api.kitchen.getActiveKitchenQueue, {});
    assert(!queueAfterCancel.newOrders.some((o) => o._id === order2Id), "Cancelled order removed from New Orders queue");

    console.log("\n--- 6. CUSTOMER SERVICE REQUEST LIFECYCLE ---");

    // Customer creates CALL_STAFF request
    const createReqRes = await fetch(`${CONVEX_SITE_URL}/server/service-requests/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CONVEX_SERVER_SECRET}`,
      },
      body: JSON.stringify({
        rawCustomerWriteToken,
        requestType: "REQUEST_WATER",
        note: "2 glasses please",
      }),
    });
    const reqData = (await createReqRes.json()) as { requestId: string };
    assert(Boolean(reqData.requestId), "Customer created REQUEST_WATER service request");

    const serviceRequestId = reqData.requestId as Id<"serviceRequests">;

    // Kitchen queries active service requests
    const activeRequests = await staffClient.query(api.service_requests.getActiveServiceRequests, {});
    const activeWaterReq = activeRequests.find((r) => r._id === serviceRequestId);
    assert(Boolean(activeWaterReq), "REQUEST_WATER request visible in kitchen active service requests");
    assert(activeWaterReq?.status === "OPEN", "Service request status is OPEN");
    assert(activeWaterReq?.tableNumber === 6, "Service request mapped to Table 6");

    // Staff acknowledges service request
    const ackResult = await staffClient.mutation(api.service_requests.acknowledgeServiceRequest, {
      requestId: serviceRequestId,
    });
    assert(ackResult.status === "ACKNOWLEDGED", "Staff successfully acknowledges service request", `Status: ${ackResult.status}`);

    const requestsAfterAck = await staffClient.query(api.service_requests.getActiveServiceRequests, {});
    const ackedReq = requestsAfterAck.find((r) => r._id === serviceRequestId);
    assert(ackedReq?.status === "ACKNOWLEDGED", "Service request updated reactively to ACKNOWLEDGED");

    // Staff resolves service request
    const resolveServiceResult = await staffClient.mutation(api.service_requests.resolveServiceRequest, {
      requestId: serviceRequestId,
    });
    assert(resolveServiceResult.status === "RESOLVED", "Staff successfully resolves service request", `Status: ${resolveServiceResult.status}`);

    const requestsAfterResolve = await staffClient.query(api.service_requests.getActiveServiceRequests, {});
    assert(!requestsAfterResolve.some((r) => r._id === serviceRequestId), "Resolved service request removed from active queue");

    console.log("\n--- 7. LIVE KITCHEN METRICS ---");

    const metrics = await staffClient.query(api.kitchen.getKitchenMetrics, {});
    assert(typeof metrics.newOrdersCount === "number", "Metrics return newOrdersCount", `New: ${metrics.newOrdersCount}`);
    assert(typeof metrics.preparingOrdersCount === "number", "Metrics return preparingOrdersCount", `Preparing: ${metrics.preparingOrdersCount}`);
    assert(typeof metrics.deliveredOrdersCount === "number", "Metrics return deliveredOrdersCount", `Delivered: ${metrics.deliveredOrdersCount}`);
    assert(typeof metrics.activeOrdersCount === "number", "Metrics return activeOrdersCount", `Active: ${metrics.activeOrdersCount}`);
    assert(typeof metrics.activeServiceRequestsCount === "number", "Metrics return activeServiceRequestsCount", `Requests: ${metrics.activeServiceRequestsCount}`);
    assert(typeof metrics.activeTablesCount === "number", "Metrics return activeTablesCount", `Tables: ${metrics.activeTablesCount}`);

    // Verify consistency: activeOrdersCount must match newOrdersCount + preparingOrdersCount
    assert(
      metrics.activeOrdersCount === metrics.newOrdersCount + metrics.preparingOrdersCount,
      "Metrics consistency: activeOrdersCount matches new + preparing"
    );

    console.log("\n--- 8. UNAUTHORIZED CUSTOMER WRITE REJECTION ---");

    let customerMutateThrew = false;
    try {
      await anonClient.mutation(api.kitchen.updateOrderStatus, {
        orderId: order1Id,
        targetStatus: "PREPARING",
      });
    } catch (err) {
      customerMutateThrew = true;
      assert(
        getErrorMessage(err).includes("UNAUTHENTICATED"),
        "Customer/anonymous caller cannot execute updateOrderStatus mutation"
      );
    }
    assert(customerMutateThrew, "Customer sessions cannot mutate kitchen order queue");

  } catch (err) {
    console.error("FATAL SUITE ERROR:", err);
    failedCount++;
  }

  console.log("\n==================================================================");
  console.log(`  PHASE 4.2 INTEGRATION TEST SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log("==================================================================");

  if (failedCount > 0) {
    process.exit(1);
  }
}

void runPhase42Tests();
