import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import { Id } from "../convex/_generated/dataModel.js";
import crypto from "crypto";
import { NextRequest } from "next/server";
import { GET as handleQRGet, POST as handleQRPost } from "../app/qr/route.js";
import { POST as handleOrdersPost } from "../app/api/orders/route.js";
import { POST as handleServiceRequestsPost } from "../app/api/service-requests/route.js";

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL || "https://outgoing-perch-487.convex.cloud";
const CONVEX_SITE_URL = process.env.NEXT_PUBLIC_CONVEX_SITE_URL || "https://outgoing-perch-487.convex.site";
const CONVEX_SERVER_SECRET = process.env.CONVEX_SERVER_SECRET;

if (!CONVEX_SERVER_SECRET) {
  console.error("FATAL: CONVEX_SERVER_SECRET must be set in environment.");
  process.exit(1);
}

console.log("==================================================================");
console.log("  COURISTA — PHASE 4.1 VERIFICATION SUITE                         ");
console.log("  Customer Frontend Integration with Convex                       ");
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

async function runPhase41Tests() {
  try {
    console.log("\n--- 0. AUTHENTICATION & FIXTURE SETUP ---");

    // 1. Staff authentication for test lifecycle operations
    const staffEmail = `staff-p41-${Date.now()}@courista.test`;
    const staffPass = "SecureStaffP41!#2026";
    const staffSignup = (await client.action(api.auth.signIn, {
      provider: "password",
      params: {
        email: staffEmail,
        password: staffPass,
        name: "Phase 4.1 Staff Auditor",
        role: "kitchen_staff",
        flow: "signUp",
      },
    })) as { tokens?: { token?: string } };

    const staffToken = staffSignup?.tokens?.token;
    const staffClient = new ConvexHttpClient(CONVEX_URL);
    if (staffToken) {
      staffClient.setAuth(staffToken);
    }
    assert(Boolean(staffToken), "Kitchen staff authentication established");

    // 2. Ensure Table 6 test fixture exists
    const rawQrStandSecret = "table-6-secret";

    const fixture = await client.mutation(api.test_helpers.seedTestFixture, {
      tableNumber: 6,
      rawCustomerToken: "setup-customer-write-token-p41",
      rawReadCapabilityToken: "setup-customer-read-token-p41",
    });
    assert(Boolean(fixture.tableId), "Table 6 test fixture prepared", `tableId: ${fixture.tableId}`);

    // If an existing table session is active on Table 6 from previous suites, close it first
    try {
      const activeBill = await staffClient.query(api.billing.getActiveTableBillByNumber, {
        tableNumber: 6,
      });
      if (activeBill && activeBill.sessionStatus === "ACTIVE") {
        // advance unfinished orders if any
        for (const u of activeBill.unfinishedOrders) {
          if (u.status === "NEW") {
            await staffClient.mutation(api.kitchen.updateOrderStatus, {
              orderId: u._id,
              targetStatus: "PREPARING",
            });
          }
          await staffClient.mutation(api.kitchen.updateOrderStatus, {
            orderId: u._id,
            targetStatus: "DELIVERED",
          });
        }
        await staffClient.mutation(api.billing.settleAndCloseTableSession, {
          tableOrderSessionId: activeBill.tableOrderSessionId,
          paymentMethod: "CASH",
        });
        console.log("  [SETUP] Cleaned up previous Table 6 active session.");
      }
    } catch {
      // No active session or clean slate
    }

    // 3. Verify public menu catalog
    console.log("\n--- 1. MENU CATALOG INTEGRATION (api.menu.getPublicMenu) ---");
    const publicMenu = await client.query(api.menu.getPublicMenu, {});
    assert(Array.isArray(publicMenu) && publicMenu.length > 0, "Public menu returns active categories", `Categories: ${publicMenu.length}`);

    const allItems = publicMenu.flatMap((c) => c.items);
    assert(allItems.length > 0, "Public menu contains available menu items", `Items: ${allItems.length}`);

    const testItem = allItems[0];
    assert(
      Boolean(testItem && testItem._id && typeof testItem.pricePaise === "number" && testItem.pricePaise > 0),
      "Menu item has valid identifier and price in integer paise",
      `Item: "${testItem.name}", pricePaise: ${testItem.pricePaise}`
    );

    // 4. Verify authoritative table query
    console.log("\n--- 2. TABLE LOOKUP INTEGRATION (api.tables.getTableBySlug) ---");
    const tableInfo = await client.query(api.tables.getTableBySlug, { slug: "table-6" });
    assert(tableInfo.tableNumber === 6, "getTableBySlug resolves correct table number", `Number: ${tableInfo.tableNumber}`);
    assert(tableInfo.slug === "table-6", "getTableBySlug matches slug", `Slug: ${tableInfo.slug}`);
    assert(tableInfo.isActive === true, "getTableBySlug confirms table is active", `isActive: ${tableInfo.isActive}`);

    // 5. Test QR Route Handler (GET and POST /qr)
    console.log("\n--- 3. PHYSICAL QR STAND RESOLUTION (app/qr/route.ts) ---");

    // Test GET /qr?slug=table-6&token=...
    const qrGetReq = new NextRequest(`http://localhost:3000/qr?slug=table-6&token=${rawQrStandSecret}`, {
      method: "GET",
    });
    const qrGetRes = await handleQRGet(qrGetReq);

    assert(
      qrGetRes.status === 307 || qrGetRes.status === 302,
      "GET /qr returns redirect response to customer table page",
      `Status: ${qrGetRes.status}, Location: ${qrGetRes.headers.get("location")}`
    );

    const redirectLocation = qrGetRes.headers.get("location") || "";
    assert(
      redirectLocation.endsWith("/table/table-6") && !redirectLocation.includes(rawQrStandSecret),
      "GET /qr strips physical QR secret token from customer redirect URL",
      `Redirect target: ${redirectLocation}`
    );

    // Inspect cookies set on redirect
    const writeCookie = qrGetRes.cookies.get("cafe_customer_session");
    const scanIdCookie = qrGetRes.cookies.get("cafe_customer_scan_id");
    const readTokenCookie = qrGetRes.cookies.get("cafe_customer_read_token");
    const tableSessionCookie = qrGetRes.cookies.get("cafe_table_session_id");

    assert(Boolean(writeCookie && writeCookie.value.length === 64), "cafe_customer_session cookie set (64-hex write token)");
    assert(Boolean(scanIdCookie && scanIdCookie.value), "cafe_customer_scan_id cookie set with valid Convex Id", `scanId: ${scanIdCookie?.value}`);
    assert(Boolean(readTokenCookie && readTokenCookie.value.length === 64), "cafe_customer_read_token cookie set (64-hex capability token)");
    assert(Boolean(tableSessionCookie && tableSessionCookie.value), "cafe_table_session_id cookie set with active table session");

    const rawCustomerWriteToken = writeCookie!.value;
    const customerScanSessionId = scanIdCookie!.value as Id<"customerScanSessions">;
    const rawReadCapabilityToken = readTokenCookie!.value;

    // Test POST /qr with invalid token
    const invalidQrReq = new NextRequest("http://localhost:3000/qr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: "table-6", token: "tampered-qr-token-xyz" }),
    });
    const invalidQrRes = await handleQRPost(invalidQrReq);
    assert(
      invalidQrRes.status === 307 || invalidQrRes.status === 302,
      "Invalid QR scan redirects to /table-invalid",
      `Location: ${invalidQrRes.headers.get("location")}`
    );

    // 6. Test Server-Mediated Customer Order Placement (app/api/orders/route.ts)
    console.log("\n--- 4. SERVER-MEDIATED ORDER PLACEMENT (app/api/orders/route.ts) ---");

    // Test missing cookie rejection
    const unauthOrderReq = new NextRequest("http://localhost:3000/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [{ menuItemId: testItem._id, quantity: 2 }],
        customerName: "Auditor Diner",
      }),
    });
    const unauthOrderRes = await handleOrdersPost(unauthOrderReq);
    assert(unauthOrderRes.status === 401, "POST /api/orders rejects requests missing customer session cookie", `Status: ${unauthOrderRes.status}`);

    // Test authenticated order placement
    const orderPayload = {
      items: [{ menuItemId: testItem._id, quantity: 2, customization: "Extra hot" }],
      customerName: "Karan",
      kitchenNote: "Dine in",
      idempotencyKey: `p41-order-${Date.now()}`,
    };

    const authOrderReq = new NextRequest("http://localhost:3000/api/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `cafe_customer_session=${rawCustomerWriteToken}`,
      },
      body: JSON.stringify(orderPayload),
    });

    const authOrderRes = await handleOrdersPost(authOrderReq);
    assert(authOrderRes.status === 200, "POST /api/orders succeeds with valid session cookie", `Status: ${authOrderRes.status}`);

    const orderData = (await authOrderRes.json()) as {
      success?: boolean;
      order?: {
        id: string;
        orderNumber: string;
        totalAmountInr: number;
        totalAmountPaise: number;
        status: string;
      };
    };

    assert(orderData.success === true, "Order response reports success");
    assert(Boolean(orderData.order?.orderNumber), "Order confirmation includes orderNumber", `orderNumber: ${orderData.order?.orderNumber}`);

    const expectedTotalPaise = testItem.pricePaise * 2;
    assert(
      orderData.order?.totalAmountPaise === expectedTotalPaise,
      "Order total correctly calculated server-side in integer paise",
      `Expected: ${expectedTotalPaise} paise, Actual: ${orderData.order?.totalAmountPaise} paise`
    );
    assert(
      orderData.order?.totalAmountInr === expectedTotalPaise / 100,
      "Order total correctly exposed in INR rupees",
      `INR: ₹${orderData.order?.totalAmountInr}`
    );

    const placedOrderId = orderData.order!.id as Id<"orders">;

    // 7. Test Reactive Order Tracking (api.orders.getCustomerTableOrders)
    console.log("\n--- 5. REACTIVE ORDER TRACKING (api.orders.getCustomerTableOrders) ---");

    const customerOrders = await client.query(api.orders.getCustomerTableOrders, {
      customerScanSessionId,
      rawReadCapabilityToken,
    });

    assert(Array.isArray(customerOrders.orders) && customerOrders.orders.length > 0, "getCustomerTableOrders returns active table orders", `Count: ${customerOrders.orders.length}`);
    assert(customerOrders.sessionStatus === "ACTIVE", "Table session is reported ACTIVE", `sessionStatus: ${customerOrders.sessionStatus}`);

    const matchedOrder = customerOrders.orders.find((o) => o._id === placedOrderId);
    assert(Boolean(matchedOrder), "Newly placed order appears in table orders query");
    assert(matchedOrder?.status === "NEW", "Order status initialized to NEW", `status: ${matchedOrder?.status}`);
    assert(matchedOrder?.isCurrentDevice === true, "isCurrentDevice flag is true for ordering device", `isCurrentDevice: ${matchedOrder?.isCurrentDevice}`);
    assert(matchedOrder?.items.length === 1 && matchedOrder.items[0].quantity === 2, "Line item snapshot correctly preserved");

    // 8. Test Customer Service Request Placement & Tracking
    console.log("\n--- 6. CUSTOMER SERVICE REQUESTS (app/api/service-requests/route.ts) ---");

    const serviceReq = new NextRequest("http://localhost:3000/api/service-requests", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `cafe_customer_session=${rawCustomerWriteToken}`,
      },
      body: JSON.stringify({
        requestType: "CALL_STAFF",
        note: "Need an extra glass please",
      }),
    });

    const serviceRes = await handleServiceRequestsPost(serviceReq);
    assert(serviceRes.status === 200, "POST /api/service-requests succeeds with valid session cookie", `Status: ${serviceRes.status}`);

    const serviceData = (await serviceRes.json()) as {
      success?: boolean;
      serviceRequest?: { id: string; request_type: string; status: string };
    };
    assert(serviceData.success === true, "Service request creation reports success");

    // Verify reactive tracking of service request
    const customerServiceRequests = await client.query(api.service_requests.getCustomerServiceRequests, {
      customerScanSessionId,
      rawReadCapabilityToken,
    });

    assert(customerServiceRequests.length > 0, "getCustomerServiceRequests returns customer service requests", `Count: ${customerServiceRequests.length}`);
    const matchedService = customerServiceRequests.find((r) => r.requestType === "CALL_STAFF");
    assert(Boolean(matchedService), "CALL_STAFF request tracked reactively");
    assert(matchedService?.status === "OPEN", "Service request status initialized to OPEN");
    assert(matchedService?.isCurrentDevice === true, "isCurrentDevice is true for service request creator");

    // 9. Test Authoritative Customer Running Bill (api.billing.getCustomerTableBill)
    console.log("\n--- 7. AUTHORITATIVE RUNNING BILL (api.billing.getCustomerTableBill) ---");

    const billBeforeDelivery = await client.query(api.billing.getCustomerTableBill, {
      customerScanSessionId,
      rawReadCapabilityToken,
    });

    assert(billBeforeDelivery.sessionStatus === "ACTIVE", "Running bill session status is ACTIVE");
    assert(billBeforeDelivery.unfinishedOrders.length === 1, "Unfinished orders count is 1 (order NEW)", `Count: ${billBeforeDelivery.unfinishedOrders.length}`);
    assert(billBeforeDelivery.pendingAmountPaise === expectedTotalPaise, "Pending amount reflects order in preparation", `Pending: ${billBeforeDelivery.pendingAmountPaise} paise`);
    assert(billBeforeDelivery.payableAmountPaise === 0, "Payable amount is 0 before delivery", `Payable: ${billBeforeDelivery.payableAmountPaise} paise`);

    // Kitchen advances order to PREPARING then DELIVERED
    await staffClient.mutation(api.kitchen.updateOrderStatus, {
      orderId: placedOrderId,
      targetStatus: "PREPARING",
    });
    await staffClient.mutation(api.kitchen.updateOrderStatus, {
      orderId: placedOrderId,
      targetStatus: "DELIVERED",
    });

    const billAfterDelivery = await client.query(api.billing.getCustomerTableBill, {
      customerScanSessionId,
      rawReadCapabilityToken,
    });

    assert(billAfterDelivery.deliveredOrders.length === 1, "Delivered orders count is 1 after kitchen delivery");
    assert(billAfterDelivery.unfinishedOrders.length === 0, "Unfinished orders count is 0 after delivery");
    assert(billAfterDelivery.payableAmountPaise === expectedTotalPaise, "Authoritative payable amount matches delivered total", `Payable: ${billAfterDelivery.payableAmountPaise} paise`);

    // 10. Test Settlement, Session Closure & UI Protection
    console.log("\n--- 8. TABLE SESSION SETTLEMENT & CLOSURE (api.billing.settleAndCloseTableSession) ---");

    const settleResult = await staffClient.mutation(api.billing.settleAndCloseTableSession, {
      tableOrderSessionId: tableSessionCookie!.value as Id<"tableOrderSessions">,
      paymentMethod: "UPI",
    });
    assert(settleResult.success === true, "Staff successfully settles payment and closes table session", `Method: UPI, Amount: ₹${settleResult.finalBillAmountPaise / 100}`);

    // Verify customer scan session is atomically revoked upon session closure
    let revokedThrew = false;
    try {
      await client.query(api.billing.getCustomerTableBill, {
        customerScanSessionId,
        rawReadCapabilityToken,
      });
    } catch (err) {
      revokedThrew = true;
      assert(
        getErrorMessage(err).includes("inactive or revoked"),
        "Customer scan session is atomically revoked upon table session closure",
        getErrorMessage(err)
      );
    }
    assert(revokedThrew, "Revoked customer scan session cannot read active billing state");

    // Verify order placement is blocked after table session closure
    const closedOrderReq = new NextRequest("http://localhost:3000/api/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `cafe_customer_session=${rawCustomerWriteToken}`,
      },
      body: JSON.stringify({
        items: [{ menuItemId: testItem._id, quantity: 1 }],
        customerName: "Post-closure Attempt",
      }),
    });

    const closedOrderRes = await handleOrdersPost(closedOrderReq);
    assert(closedOrderRes.status === 400, "POST /api/orders rejects orders on closed table dining sessions", `Status: ${closedOrderRes.status}`);

    const closedData = (await closedOrderRes.json()) as { error?: string };
    assert(closedData.error === "SESSION_CLOSED", "Rejection specifies SESSION_CLOSED error code", `Error: ${closedData.error}`);

    // 11. Security boundaries (tampered capability token)
    console.log("\n--- 9. SECURITY BOUNDARIES & CAPABILITY VALIDATION ---");
    let tamperedThrew = false;
    try {
      await client.query(api.orders.getCustomerTableOrders, {
        customerScanSessionId,
        rawReadCapabilityToken: "tampered-capability-token-64-hex-characters-invalid-0000000000000",
      });
    } catch (err) {
      tamperedThrew = true;
      assert(getErrorMessage(err).includes("UNAUTHORIZED"), "Tampered capability token is rejected with UNAUTHORIZED");
    }
    assert(tamperedThrew, "Read queries reject tampered capability tokens");

  } catch (err) {
    console.error("FATAL SUITE ERROR:", err);
    failedCount++;
  }

  console.log("\n==================================================================");
  console.log(`  PHASE 4.1 INTEGRATION TEST SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log("==================================================================");

  if (failedCount > 0) {
    process.exit(1);
  }
}

void runPhase41Tests();
