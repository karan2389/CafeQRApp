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
console.log("  COURISTA — PHASE 3.3 VERIFICATION SUITE                         ");
console.log("  Group D: Kitchen Dashboard & Order Lifecycle                    ");
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

async function runPhase33Tests() {
  try {
    console.log("\n--- 0. AUTHENTICATION BOOTSTRAP ---");

    // 1. Admin login credentials
    const adminEmail = `admin-p33-${Date.now()}@courista.test`;
    const adminPass = "SecureAdminP33!#2026";
    const adminSignup = await client.action(api.auth.signIn, {
      provider: "password",
      params: {
        email: adminEmail,
        password: adminPass,
        name: "Phase 3.3 Admin",
        role: "admin",
        flow: "signUp",
      },
    });
    const adminToken = adminSignup!.tokens!.token;
    assert(Boolean(adminToken), "Admin bootstrap authentication token acquired");

    // 2. Kitchen Staff login credentials
    const staffEmail = `staff-p33-${Date.now()}@courista.test`;
    const staffPass = "KitchenStaffP33!#2026";
    const staffSignup = await client.action(api.auth.signIn, {
      provider: "password",
      params: {
        email: staffEmail,
        password: staffPass,
        name: "Phase 3.3 Line Chef",
        role: "kitchen_staff",
        flow: "signUp",
      },
    });
    const staffToken = staffSignup!.tokens!.token;
    assert(Boolean(staffToken), "Kitchen Staff bootstrap authentication token acquired");

    console.log("\n--- 1. FIXTURE SETUP: TABLE & MENU ITEMS ---");

    client.setAuth(adminToken);

    // Setup Table 6
    const t6StandSecret = "table-6-physical-stand-secret-p33";
    const fixture6 = await client.mutation(api.test_helpers.seedTestFixture, {
      tableNumber: 6,
      rawCustomerToken: crypto.randomBytes(32).toString("hex"),
      rawReadCapabilityToken: crypto.randomBytes(32).toString("hex"),
    });
    await client.mutation(api.tables.adminRegenerateTableQrToken, {
      tableId: fixture6.tableId,
      newQrTokenHash: sha256Hex(t6StandSecret),
    });

    // Create Category & Menu Item
    const categoryResult = await client.mutation(api.categories.createCategory, {
      name: "Kitchen Specialties",
      slug: `kitchen-spec-${Date.now()}`,
      displayOrder: 1,
      isActive: true,
    });

    const menuItemA = await client.mutation(api.menu.createMenuItem, {
      categoryId: categoryResult.categoryId,
      name: "Truffle Mushroom Risotto",
      description: "Wild mushrooms with arborio rice and truffle oil",
      pricePaise: 45000,
      displayOrder: 1,
      isAvailable: true,
    });

    const menuItemB = await client.mutation(api.menu.createMenuItem, {
      categoryId: categoryResult.categoryId,
      name: "Charred Peach Iced Tea",
      description: "House-brewed black tea with charred peach puree",
      pricePaise: 22000,
      displayOrder: 2,
      isAvailable: true,
    });

    // Resolve Scan for Table 6 Customer
    const resolveScanUrl = `${CONVEX_SITE_URL}/server/sessions/resolve-scan`;
    const customerRawWrite = crypto.randomBytes(32).toString("hex");
    const customerRawRead = crypto.randomBytes(32).toString("hex");

    const scanRes = await fetch(resolveScanUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CONVEX_SERVER_SECRET}`,
      },
      body: JSON.stringify({
        tableSlug: "table-6",
        qrToken: t6StandSecret,
        rawCustomerWriteToken: customerRawWrite,
        rawReadCapabilityToken: customerRawRead,
      }),
    });
    const scanData = (await scanRes.json()) as {
      tableOrderSessionId: Id<"tableOrderSessions">;
      customerScanSessionId: Id<"customerScanSessions">;
    };
    assert(scanRes.status === 200, "Table 6 Customer Scan resolved successfully");

    console.log("\n--- GROUP D.1: KITCHEN AUTHORIZATION BOUNDARIES ---");

    // Test D1.1: Anonymous caller denied getActiveKitchenQueue
    client.clearAuth();
    let anonQueueRejected = false;
    try {
      await client.query(api.kitchen.getActiveKitchenQueue, {});
    } catch (err: unknown) {
      anonQueueRejected = getErrorMessage(err).includes("UNAUTHENTICATED");
    }
    assert(anonQueueRejected, "Security Guard: Anonymous caller denied getActiveKitchenQueue (UNAUTHENTICATED)");

    // Test D1.2: Anonymous caller denied updateOrderStatus
    let anonMutationRejected = false;
    try {
      await client.mutation(api.kitchen.updateOrderStatus, {
        orderId: "invalid_id_test" as unknown as Id<"orders">,
        targetStatus: "PREPARING",
      });
    } catch (err: unknown) {
      anonMutationRejected =
        getErrorMessage(err).includes("UNAUTHENTICATED") ||
        getErrorMessage(err).includes("ArgumentValidationError");
    }
    assert(anonMutationRejected, "Security Guard: Anonymous caller denied updateOrderStatus (UNAUTHENTICATED)");

    // Test D1.3: Anonymous caller denied getKitchenMetrics
    let anonMetricsRejected = false;
    try {
      await client.query(api.kitchen.getKitchenMetrics, {});
    } catch (err: unknown) {
      anonMetricsRejected = getErrorMessage(err).includes("UNAUTHENTICATED");
    }
    assert(anonMetricsRejected, "Security Guard: Anonymous caller denied getKitchenMetrics (UNAUTHENTICATED)");

    // Test D1.4: Kitchen Staff caller granted access
    client.setAuth(staffToken);
    const staffQueue = await client.query(api.kitchen.getActiveKitchenQueue, {});
    assert(
      staffQueue && Array.isArray(staffQueue.newOrders) && Array.isArray(staffQueue.preparingOrders),
      "Role Permission: Kitchen Staff caller granted access to active kitchen queue"
    );

    // Test D1.5: Administrator caller granted access
    client.setAuth(adminToken);
    const adminQueue = await client.query(api.kitchen.getActiveKitchenQueue, {});
    assert(
      adminQueue && Array.isArray(adminQueue.newOrders),
      "Role Permission: Administrator granted supervisory access to active kitchen queue"
    );

    console.log("\n--- GROUP D.2: ORDER INGESTION & QUEUE ORGANIZATION ---");

    // Customer places Order 1 (Truffle Risotto + Iced Tea)
    const orderSubmitUrl = `${CONVEX_SITE_URL}/server/orders/submit`;
    const order1Res = await fetch(orderSubmitUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CONVEX_SERVER_SECRET}`,
      },
      body: JSON.stringify({
        rawCustomerWriteToken: customerRawWrite,
        items: [
          {
            menuItemId: menuItemA.menuItemId,
            quantity: 2,
            customizationNotes: "Extra parmesan please",
          },
          {
            menuItemId: menuItemB.menuItemId,
            quantity: 1,
            customizationNotes: "Less ice",
          },
        ],
        customerName: "Rohan (Seat 1)",
        orderNotes: "Allergies: None",
        idempotencyKey: `p33-ord1-${Date.now()}`,
      }),
    });
    assert(order1Res.status === 200, "Customer Order 1 submitted successfully");
    const order1Data = (await order1Res.json()) as {
      orderId: Id<"orders">;
      orderNumber: string;
      totalAmountPaise: number;
    };

    // Staff inspects kitchen queue
    client.setAuth(staffToken);
    const queueAfterOrder1 = await client.query(api.kitchen.getActiveKitchenQueue, {});

    const kitchenTicket1 = queueAfterOrder1.newOrders.find((o) => o._id === order1Data.orderId);
    assert(
      Boolean(kitchenTicket1),
      "Realtime Queue Ingestion: New customer order appears immediately in newOrders queue",
      `Ticket: ${kitchenTicket1?.orderNumber}`
    );

    assert(
      kitchenTicket1?.tableNumber === 6 &&
      kitchenTicket1?.customerName === "Rohan (Seat 1)" &&
      kitchenTicket1?.orderNotes === "Allergies: None" &&
      kitchenTicket1?.items.length === 2,
      "Order Ticket Metadata: Table number, customer name, notes and item counts accurately rendered"
    );

    const risottoItem = kitchenTicket1?.items.find((i) => i.itemName === "Truffle Mushroom Risotto");
    assert(
      risottoItem?.quantity === 2 &&
      risottoItem?.unitPricePaise === 45000 &&
      risottoItem?.customizationNotes === "Extra parmesan please",
      "Item Snapshot Integrity: Line item snapshot preserves quantity, price and custom notes"
    );

    // Verify Table Grouping
    const table6Group = queueAfterOrder1.ordersByTable.find((t) => t.tableNumber === 6);
    assert(
      Boolean(table6Group && table6Group.orders.some((o) => o._id === order1Data.orderId)),
      "Queue Organization: Active orders grouped by dining table for line-cook ergonomics"
    );

    console.log("\n--- GROUP D.3: ORDER LIFECYCLE & STATE TRANSITIONS ---");

    // Test D3.1: Reject non-existent order ID
    let unknownOrderRejected = false;
    try {
      await client.mutation(api.kitchen.updateOrderStatus, {
        orderId: fixture6.tableId as unknown as Id<"orders">, // Not an order ID
        targetStatus: "PREPARING",
      });
    } catch (err: unknown) {
      unknownOrderRejected =
        getErrorMessage(err).includes("ORDER_NOT_FOUND") ||
        getErrorMessage(err).includes("ArgumentValidationError");
    }
    assert(unknownOrderRejected, "Validation Guard: Updating non-existent order ID REJECTED");

    // Test D3.2: Reject invalid transition: NEW -> DELIVERED (Must prepare first!)
    let invalidSkipPrepRejected = false;
    try {
      await client.mutation(api.kitchen.updateOrderStatus, {
        orderId: order1Data.orderId,
        targetStatus: "DELIVERED",
      });
    } catch (err: unknown) {
      invalidSkipPrepRejected = getErrorMessage(err).includes("INVALID_STATUS_TRANSITION");
    }
    assert(
      invalidSkipPrepRejected,
      "State Machine: Skipping PREPARING stage (NEW -> DELIVERED) REJECTED (INVALID_STATUS_TRANSITION)"
    );

    // Test D3.3: Reject duplicate status transition (NEW -> NEW)
    let duplicateStatusRejected = false;
    try {
      await client.mutation(api.kitchen.updateOrderStatus, {
        orderId: order1Data.orderId,
        targetStatus: "PREPARING",
      });
      // Try again with exact same status
      await client.mutation(api.kitchen.updateOrderStatus, {
        orderId: order1Data.orderId,
        targetStatus: "PREPARING",
      });
    } catch (err: unknown) {
      duplicateStatusRejected = getErrorMessage(err).includes("NO_STATUS_CHANGE");
    }
    assert(
      duplicateStatusRejected,
      "Idempotency Guard: Redundant status transition (PREPARING -> PREPARING) REJECTED (NO_STATUS_CHANGE)"
    );

    // Verify Realtime Transition: Order moved from newOrders to preparingOrders
    const queueAfterPrep = await client.query(api.kitchen.getActiveKitchenQueue, {});
    const isNowInPrep = queueAfterPrep.preparingOrders.some((o) => o._id === order1Data.orderId);
    const isNotInNew = !queueAfterPrep.newOrders.some((o) => o._id === order1Data.orderId);
    assert(
      isNowInPrep && isNotInNew,
      "Realtime Queue Transition: Order moved from newOrders into preparingOrders"
    );

    // Verify Customer Reactive Tracking View reflects PREPARING
    client.clearAuth();
    const customerOrdersDuringPrep = await client.query(api.orders.getCustomerTableOrders, {
      customerScanSessionId: scanData.customerScanSessionId,
      rawReadCapabilityToken: customerRawRead,
    });
    const customerOrderTicketPrep = customerOrdersDuringPrep.orders.find((o) => o._id === order1Data.orderId);
    assert(
      customerOrderTicketPrep?.status === "PREPARING",
      "Customer Realtime View: Customer order tracking query reflects PREPARING status"
    );

    // Test D3.4: Reject backwards transition (PREPARING -> NEW)
    client.setAuth(staffToken);
    let backwardsTransitionRejected = false;
    try {
      await client.mutation(api.kitchen.updateOrderStatus, {
        orderId: order1Data.orderId,
        targetStatus: "PREPARING", // Attempting backwards or invalid
      });
    } catch (err: unknown) {
      backwardsTransitionRejected =
        getErrorMessage(err).includes("INVALID_STATUS_TRANSITION") ||
        getErrorMessage(err).includes("NO_STATUS_CHANGE");
    }
    assert(backwardsTransitionRejected, "State Machine: Backwards status transition REJECTED");

    // Test D3.5: Valid transition: PREPARING -> DELIVERED
    const deliverResult = await client.mutation(api.kitchen.updateOrderStatus, {
      orderId: order1Data.orderId,
      targetStatus: "DELIVERED",
    });
    assert(
      deliverResult.success && deliverResult.newStatus === "DELIVERED",
      "State Transition: Order marked DELIVERED upon completion by runner"
    );

    // Verify Realtime Transition: Order moved to recentDeliveredOrders
    const queueAfterDelivered = await client.query(api.kitchen.getActiveKitchenQueue, {});
    const isNowDelivered = queueAfterDelivered.recentDeliveredOrders.some((o) => o._id === order1Data.orderId);
    const isOutFromActive = !queueAfterDelivered.preparingOrders.some((o) => o._id === order1Data.orderId);
    assert(
      isNowDelivered && isOutFromActive,
      "Queue Segregation: Delivered order moved to recentDeliveredOrders and cleared from active prep line"
    );

    // Verify Customer Tracking View reflects DELIVERED
    client.clearAuth();
    const customerOrdersDelivered = await client.query(api.orders.getCustomerTableOrders, {
      customerScanSessionId: scanData.customerScanSessionId,
      rawReadCapabilityToken: customerRawRead,
    });
    const customerTicketDelivered = customerOrdersDelivered.orders.find((o) => o._id === order1Data.orderId);
    assert(
      customerTicketDelivered?.status === "DELIVERED",
      "Customer Realtime View: Customer order tracking query reflects DELIVERED status"
    );

    // Test D3.6: Reject mutations on terminal DELIVERED status
    client.setAuth(staffToken);
    let deliveredMutationRejected = false;
    try {
      await client.mutation(api.kitchen.updateOrderStatus, {
        orderId: order1Data.orderId,
        targetStatus: "PREPARING",
      });
    } catch (err: unknown) {
      deliveredMutationRejected = getErrorMessage(err).includes("INVALID_STATUS_TRANSITION");
    }
    assert(
      deliveredMutationRejected,
      "Terminal State Guard: Modifying completed/DELIVERED order REJECTED (INVALID_STATUS_TRANSITION)"
    );

    console.log("\n--- GROUP D.4: ORDER CANCELLATION WORKFLOW ---");

    // Customer places Order 2 to test cancellation
    const order2Res = await fetch(orderSubmitUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CONVEX_SERVER_SECRET}`,
      },
      body: JSON.stringify({
        rawCustomerWriteToken: customerRawWrite,
        items: [{ menuItemId: menuItemB.menuItemId, quantity: 1 }],
        customerName: "Rohan (Seat 1)",
        idempotencyKey: `p33-ord2-${Date.now()}`,
      }),
    });
    const order2Data = (await order2Res.json()) as { orderId: Id<"orders"> };

    // Kitchen cancels Order 2 (e.g. 86'd mid-shift or customer requested)
    const cancelResult = await client.mutation(api.kitchen.updateOrderStatus, {
      orderId: order2Data.orderId,
      targetStatus: "CANCELLED",
      cancellationReason: "Ran out of fresh charred peach puree",
    });
    assert(
      cancelResult.success && cancelResult.newStatus === "CANCELLED",
      "Cancellation Workflow: Staff cancelled order with explicit reason recorded"
    );

    // Verify customer view reflects CANCELLED with reason
    client.clearAuth();
    const customerOrdersAfterCancel = await client.query(api.orders.getCustomerTableOrders, {
      customerScanSessionId: scanData.customerScanSessionId,
      rawReadCapabilityToken: customerRawRead,
    });
    const cancelledTicket = customerOrdersAfterCancel.orders.find((o) => o._id === order2Data.orderId);
    assert(
      cancelledTicket?.status === "CANCELLED" &&
      cancelledTicket?.cancellationReason === "Ran out of fresh charred peach puree",
      "Customer Visibility: Cancellation status and reason transparently delivered to diner"
    );

    console.log("\n--- GROUP D.5: KITCHEN OPERATIONAL METRICS & SERVICE REQUESTS ---");

    client.setAuth(staffToken);
    const metrics = await client.query(api.kitchen.getKitchenMetrics, {});
    assert(
      typeof metrics.activeOrdersCount === "number" &&
      typeof metrics.deliveredOrdersCount === "number" &&
      typeof metrics.activeServiceRequestsCount === "number" &&
      metrics.deliveredOrdersCount >= 1,
      "Kitchen Metrics: Realtime count of active orders, delivered tickets, and active tables",
      `Active: ${metrics.activeOrdersCount}, Delivered: ${metrics.deliveredOrdersCount}, Tables: ${metrics.activeTablesCount}`
    );

    // Reconnection & Data Refresh Simulation
    const freshClient = new ConvexHttpClient(CONVEX_URL);
    freshClient.setAuth(staffToken);
    const refreshedQueue = await freshClient.query(api.kitchen.getActiveKitchenQueue, {});
    assert(
      refreshedQueue.recentDeliveredOrders.some((o) => o._id === order1Data.orderId),
      "Connection Resilience: Disconnected client instantly recovers complete kitchen state upon reconnect"
    );

    console.log("\n==================================================================");
    console.log(`  PHASE 3.3 TEST SUITE RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
    console.log("==================================================================");

    if (failedCount > 0) {
      process.exit(1);
    }
  } catch (fatalError: unknown) {
    console.error("FATAL TEST SUITE ERROR:", fatalError);
    process.exit(1);
  }
}

void runPhase33Tests();
