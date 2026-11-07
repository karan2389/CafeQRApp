import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import crypto from "crypto";

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL || "http://127.0.0.1:3210";

console.log("==================================================================");
console.log("  COURISTA — MILESTONE 2: SECURITY & CONCURRENCY VERIFICATION     ");
console.log("==================================================================");
console.log(`Target Convex Deployment: ${CONVEX_URL}\n`);

const client = new ConvexHttpClient(CONVEX_URL);

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    if (detail) console.log(`         ${detail}`);
    passedCount++;
  } else {
    console.error(`  [FAIL] ${testName}`);
    if (detail) console.error(`         ${detail}`);
    failedCount++;
  }
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

async function runTests() {
  try {
    // 0. Verify Backend Health
    console.log("--- 0. BACKEND STATUS CHECK ---");
    const health = await client.query(api.health.getBackendStatus);
    assert(
      health.status === "initialized" && health.backend === "convex",
      "Convex development backend is online and responding",
      `Status: ${health.status}, Backend: ${health.backend}`
    );

    // 1. Convex Auth: Password Signup, Login, Session Persistence, and Logout
    console.log("\n--- 1. CONVEX AUTH: PASSWORD SIGNUP / SIGNIN / SIGNOUT ---");
    const testAdminEmail = `admin-${Date.now()}@emberandoak.com`;
    const testAdminPassword = "SecureAdminPassword2026!";

    // 1a. Password Signup
    const signupResult = await client.action(api.auth.signIn, {
      provider: "password",
      params: {
        email: testAdminEmail,
        password: testAdminPassword,
        name: "Head Administrator",
        role: "admin",
        flow: "signUp",
      },
    });

    assert(
      signupResult !== null && signupResult.tokens !== undefined && signupResult.tokens !== null,
      "Convex Auth: Password signUp successfully created account and returned JWT tokens",
      `Token received: ${signupResult?.tokens?.token ? "Bearer eyJ... (valid JWT)" : "none"}`
    );

    const adminToken = signupResult!.tokens!.token;
    client.setAuth(adminToken);

    // 1b. Session persistence & Viewer query
    const adminViewer = await client.query(api.users.viewer);
    assert(
      adminViewer !== null &&
        adminViewer.email === testAdminEmail &&
        adminViewer.role === "admin" &&
        adminViewer.isActive === true,
      "Convex Auth: Viewer query verified authenticated user with correct role and active status",
      `User ID: ${adminViewer?.id}, Role: ${adminViewer?.role}, Active: ${adminViewer?.isActive}`
    );

    // 1c. Password Signout
    await client.action(api.auth.signOut);
    client.clearAuth();

    const signedOutViewer = await client.query(api.users.viewer);
    assert(
      signedOutViewer === null,
      "Convex Auth: signOut successfully cleared session; viewer returns null"
    );

    // 1d. Password Signin
    const signinResult = await client.action(api.auth.signIn, {
      provider: "password",
      params: {
        email: testAdminEmail,
        password: testAdminPassword,
        flow: "signIn",
      },
    });

    assert(
      signinResult !== null && signinResult.tokens !== undefined && signinResult.tokens !== null,
      "Convex Auth: Password signIn successfully re-authenticated with existing credentials",
      `New Token received: ${signinResult?.tokens?.token ? "Bearer eyJ... (valid JWT)" : "none"}`
    );

    const reauthAdminToken = signinResult!.tokens!.token;
    client.setAuth(reauthAdminToken);
    const reauthViewer = await client.query(api.users.viewer);
    assert(
      reauthViewer?.email === testAdminEmail,
      "Convex Auth: Re-authenticated session verified viewer profile"
    );

    // Also create a Kitchen Staff user for role boundary testing
    const testStaffEmail = `kitchen-${Date.now()}@emberandoak.com`;
    const testStaffPassword = "SecureStaffPassword2026!";
    const staffSignupResult = await client.action(api.auth.signIn, {
      provider: "password",
      params: {
        email: testStaffEmail,
        password: testStaffPassword,
        name: "Line Cook 1",
        role: "kitchen_staff",
        flow: "signUp",
      },
    });
    const staffToken = staffSignupResult!.tokens!.token;

    // 2. Active Table Session Uniqueness & Concurrency (OCC Test)
    console.log("\n--- 2. CONVEX OCC CONCURRENCY: ACTIVE TABLE SESSION UNIQUENESS ---");
    // Seed Table 5 for concurrency test
    const rawCustomerToken5 = crypto.randomBytes(32).toString("hex");
    const rawReadToken5 = crypto.randomBytes(32).toString("hex");
    const fixture5 = await client.mutation(api.test_helpers.seedTestFixture, {
      tableNumber: 5,
      rawCustomerToken: rawCustomerToken5,
      rawReadCapabilityToken: rawReadToken5,
    });

    // Close the initial session from seed so table has no active session
    client.setAuth(reauthAdminToken);
    await client.mutation(api.test_helpers.testCloseTableSession, {
      tableOrderSessionId: fixture5.tableOrderSessionId,
      paymentMethod: "CASH",
    });

    // Simulate 5 simultaneous QR scans attempting to create an active session for Table 5
    console.log("  Simulating 5 simultaneous QR scans calling getOrCreateTableSession for Table 5...");
    const concurrentResults = await Promise.all([
      client.mutation(api.test_helpers.getOrCreateTableSession, { tableId: fixture5.tableId }),
      client.mutation(api.test_helpers.getOrCreateTableSession, { tableId: fixture5.tableId }),
      client.mutation(api.test_helpers.getOrCreateTableSession, { tableId: fixture5.tableId }),
      client.mutation(api.test_helpers.getOrCreateTableSession, { tableId: fixture5.tableId }),
      client.mutation(api.test_helpers.getOrCreateTableSession, { tableId: fixture5.tableId }),
    ]);

    const firstId = concurrentResults[0];
    const allIdentical = concurrentResults.every((id) => id === firstId);
    assert(
      allIdentical,
      "OCC Concurrency: All 5 simultaneous scans resolved to the exact same tableOrderSessionId",
      `Session ID: ${firstId}`
    );

    const activeSessionCount = await client.query(api.test_helpers.countActiveSessionsForTable, {
      tableId: fixture5.tableId,
    });
    assert(
      activeSessionCount === 1,
      "OCC Concurrency: Exactly 1 active session exists in tableOrderSessions table (zero duplicates)",
      `Active sessions count: ${activeSessionCount}`
    );

    // 3. Security Boundary Enforcement Tests
    console.log("\n--- 3. SECURITY BOUNDARY ENFORCEMENT & REJECTION TESTS ---");

    // Test 3.1: Anonymous user attempting admin mutation
    client.clearAuth();
    let anonAdminRejected = false;
    let anonAdminMessage = "";
    try {
      await client.mutation(api.test_helpers.testAdminOnlyMutation, {});
    } catch (err: unknown) {
      anonAdminRejected = true;
      anonAdminMessage = getErrorMessage(err);
    }
    assert(
      anonAdminRejected && anonAdminMessage.includes("UNAUTHENTICATED"),
      "Security Guard: Anonymous caller attempting admin mutation was REJECTED",
      `Error caught: ${anonAdminMessage.slice(0, 80)}...`
    );

    // Test 3.2: Kitchen staff attempting admin mutation
    client.setAuth(staffToken);
    // 3.2a: Staff CAN call staff mutation
    const staffAllowed = await client.mutation(api.test_helpers.testStaffOnlyMutation, {});
    assert(
      staffAllowed.success && staffAllowed.role === "kitchen_staff",
      "Role Permission: Kitchen staff caller permitted for kitchen staff mutation"
    );

    // 3.2b: Staff CANNOT call admin mutation
    let staffAdminRejected = false;
    let staffAdminMessage = "";
    try {
      await client.mutation(api.test_helpers.testAdminOnlyMutation, {});
    } catch (err: unknown) {
      staffAdminRejected = true;
      staffAdminMessage = getErrorMessage(err);
    }
    assert(
      staffAdminRejected && staffAdminMessage.includes("Administrator privileges required"),
      "Role Isolation: Kitchen staff caller attempting admin mutation was REJECTED",
      `Error caught: ${staffAdminMessage.slice(0, 80)}...`
    );

    // Test 3.3: Inactive staff attempting any action
    const staffViewer = await client.query(api.users.viewer);
    const staffUserId = staffViewer!.id;

    // Deactivate staff user via admin
    client.setAuth(reauthAdminToken);
    await client.mutation(api.test_helpers.setUserActiveStatus, {
      userId: staffUserId,
      isActive: false,
    });

    // Try calling staff mutation with inactive account
    client.setAuth(staffToken);
    let inactiveStaffRejected = false;
    let inactiveStaffMessage = "";
    try {
      await client.mutation(api.test_helpers.testStaffOnlyMutation, {});
    } catch (err: unknown) {
      inactiveStaffRejected = true;
      inactiveStaffMessage = getErrorMessage(err);
    }
    assert(
      inactiveStaffRejected && inactiveStaffMessage.includes("inactive or disabled"),
      "Account Lifecycle: Inactive staff caller attempting mutation was REJECTED",
      `Error caught: ${inactiveStaffMessage.slice(0, 80)}...`
    );

    // Test 3.4: Cross-table customer query isolation
    // Seed Table 1 and Table 2 fixtures
    const rawCustomerToken1 = crypto.randomBytes(32).toString("hex");
    const rawReadToken1 = crypto.randomBytes(32).toString("hex");
    const fixture1 = await client.mutation(api.test_helpers.seedTestFixture, {
      tableNumber: 1,
      rawCustomerToken: rawCustomerToken1,
      rawReadCapabilityToken: rawReadToken1,
    });

    const rawCustomerToken2 = crypto.randomBytes(32).toString("hex");
    const rawReadToken2 = crypto.randomBytes(32).toString("hex");
    const fixture2 = await client.mutation(api.test_helpers.seedTestFixture, {
      tableNumber: 2,
      rawCustomerToken: rawCustomerToken2,
      rawReadCapabilityToken: rawReadToken2,
    });

    client.clearAuth(); // Customer operates without staff auth

    // 3.4a: Valid query for Table 1
    const validCustomerQuery = await client.query(api.test_helpers.testGetTableOrders, {
      customerScanSessionId: fixture1.customerScanSessionId,
      rawReadCapabilityToken: rawReadToken1,
      targetTableOrderSessionId: fixture1.tableOrderSessionId,
    });
    assert(
      validCustomerQuery.sessionStatus === "ACTIVE",
      "Customer Read Capability: Legitimate customer query for own table session SUCCEEDED"
    );

    // 3.4b: Cross-table tampering (Customer 1 attempts to query Table 2's session)
    let crossTableRejected = false;
    let crossTableMessage = "";
    try {
      await client.query(api.test_helpers.testGetTableOrders, {
        customerScanSessionId: fixture1.customerScanSessionId,
        rawReadCapabilityToken: rawReadToken1,
        targetTableOrderSessionId: fixture2.tableOrderSessionId, // TAMPERED! Table 2 session
      });
    } catch (err: unknown) {
      crossTableRejected = true;
      crossTableMessage = getErrorMessage(err);
    }
    assert(
      crossTableRejected && crossTableMessage.includes("Cross-table access denied"),
      "Cross-Table Isolation: Diner attempting to query another table's orders was REJECTED",
      `Error caught: ${crossTableMessage.slice(0, 80)}...`
    );

    // Test 3.5: Expired or Revoked Customer Capability
    // 3.5a: Invalid token hash
    let invalidTokenRejected = false;
    let invalidTokenMessage = "";
    try {
      await client.query(api.test_helpers.testGetTableOrders, {
        customerScanSessionId: fixture1.customerScanSessionId,
        rawReadCapabilityToken: "forged-invalid-secret-token",
        targetTableOrderSessionId: fixture1.tableOrderSessionId,
      });
    } catch (err: unknown) {
      invalidTokenRejected = true;
      invalidTokenMessage = getErrorMessage(err);
    }
    assert(
      invalidTokenRejected && invalidTokenMessage.includes("Invalid capability token"),
      "Token Validation: Forged read capability token was REJECTED"
    );

    // 3.5b: Expired capability
    client.setAuth(reauthAdminToken);
    await client.mutation(api.test_helpers.setCustomerSessionState, {
      customerScanSessionId: fixture1.customerScanSessionId,
      isActive: true,
      isExpired: true,
      isRevoked: false,
    });
    client.clearAuth();

    let expiredRejected = false;
    let expiredMessage = "";
    try {
      await client.query(api.test_helpers.testGetTableOrders, {
        customerScanSessionId: fixture1.customerScanSessionId,
        rawReadCapabilityToken: rawReadToken1,
        targetTableOrderSessionId: fixture1.tableOrderSessionId,
      });
    } catch (err: unknown) {
      expiredRejected = true;
      expiredMessage = getErrorMessage(err);
    }
    assert(
      expiredRejected && expiredMessage.includes("SESSION_EXPIRED"),
      "Session Expiration: Expired customer scan session was REJECTED",
      `Error caught: ${expiredMessage.slice(0, 80)}...`
    );

    // 3.5c: Revoked capability
    client.setAuth(reauthAdminToken);
    await client.mutation(api.test_helpers.setCustomerSessionState, {
      customerScanSessionId: fixture1.customerScanSessionId,
      isActive: false,
      isExpired: false,
      isRevoked: true,
    });
    client.clearAuth();

    let revokedRejected = false;
    let revokedMessage = "";
    try {
      await client.query(api.test_helpers.testGetTableOrders, {
        customerScanSessionId: fixture1.customerScanSessionId,
        rawReadCapabilityToken: rawReadToken1,
        targetTableOrderSessionId: fixture1.tableOrderSessionId,
      });
    } catch (err: unknown) {
      revokedRejected = true;
      revokedMessage = getErrorMessage(err);
    }
    assert(
      revokedRejected && revokedMessage.includes("inactive or revoked"),
      "Revocation: Revoked customer scan session was REJECTED",
      `Error caught: ${revokedMessage.slice(0, 80)}...`
    );

    // Test 3.6: Price Manipulation in Order Submission
    client.clearAuth();
    // 3.6a: Attacker attempts to submit order claiming cappuccino price is ₹10 (1000 paise) instead of ₹350 (35000 paise)
    let priceManipulationRejected = false;
    let priceManipulationMessage = "";
    try {
      await client.mutation(api.test_helpers.testSubmitCustomerOrder, {
        customerTokenHash: fixture2.customerTokenHash,
        items: [{ menuItemId: fixture2.menuItemId, quantity: 2 }],
        clientAttemptedTotalPaise: 2000, // Attacker claims ₹20 instead of authoritative ₹700 (70000 paise)
      });
    } catch (err: unknown) {
      priceManipulationRejected = true;
      priceManipulationMessage = getErrorMessage(err);
    }
    assert(
      priceManipulationRejected && priceManipulationMessage.includes("PRICE_MANIPULATION_DETECTED"),
      "Financial Integrity: Order with manipulated client-side price was REJECTED",
      `Error caught: ${priceManipulationMessage.slice(0, 80)}...`
    );

    // 3.6b: Legitimate order submission calculates authoritative price from database
    const legitOrder = await client.mutation(api.test_helpers.testSubmitCustomerOrder, {
      customerTokenHash: fixture2.customerTokenHash,
      items: [{ menuItemId: fixture2.menuItemId, quantity: 2 }],
    });
    assert(
      legitOrder.totalAmountPaise === 70000,
      "Authoritative Pricing: Server correctly computed 2 * ₹350 = ₹700 (70000 paise) from DB",
      `Order ID: ${legitOrder.orderId}, Total: ₹${legitOrder.totalAmountPaise / 100}`
    );

    // Test 3.7: Customer attempting to close their own bill
    client.clearAuth();
    let customerCloseRejected = false;
    let customerCloseMessage = "";
    try {
      await client.mutation(api.test_helpers.testCloseTableSession, {
        tableOrderSessionId: fixture2.tableOrderSessionId,
        paymentMethod: "UPI",
      });
    } catch (err: unknown) {
      customerCloseRejected = true;
      customerCloseMessage = getErrorMessage(err);
    }
    assert(
      customerCloseRejected && customerCloseMessage.includes("UNAUTHENTICATED"),
      "Payment Boundary: Customer attempting to settle/close bill was REJECTED (requires staff)",
      `Error caught: ${customerCloseMessage.slice(0, 80)}...`
    );

    // 3.7b: Staff closes bill
    client.setAuth(reauthAdminToken);
    const staffClosure = await client.mutation(api.test_helpers.testCloseTableSession, {
      tableOrderSessionId: fixture2.tableOrderSessionId,
      paymentMethod: "UPI",
    });
    assert(
      staffClosure.success === true,
      "Payment Settlement: Authorized staff closed table session with UPI settlement",
      `Settled by: ${staffClosure.closedBy}`
    );

    // 3.7c: Duplicate closure attempt (Idempotency)
    let duplicateCloseRejected = false;
    let duplicateCloseMessage = "";
    try {
      await client.mutation(api.test_helpers.testCloseTableSession, {
        tableOrderSessionId: fixture2.tableOrderSessionId,
        paymentMethod: "UPI",
      });
    } catch (err: unknown) {
      duplicateCloseRejected = true;
      duplicateCloseMessage = getErrorMessage(err);
    }
    assert(
      duplicateCloseRejected && duplicateCloseMessage.includes("SESSION_ALREADY_CLOSED"),
      "Idempotency: Duplicate session closure was REJECTED with SESSION_ALREADY_CLOSED"
    );

    console.log("\n==================================================================");
    console.log(`  VERIFICATION RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
    console.log("==================================================================");

    if (failedCount > 0) {
      process.exit(1);
    }
  } catch (fatalError: unknown) {
    console.error("Fatal test runner error:", fatalError);
    process.exit(1);
  }
}

runTests();
