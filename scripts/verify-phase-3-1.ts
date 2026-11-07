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
console.log("  COURISTA — PHASE 3.1 VERIFICATION SUITE                         ");
console.log("  Group A: QR & Session Lifecycle                                 ");
console.log("  Group B: Menu Catalog & Administration                          ");
console.log("==================================================================");
console.log(`Convex Cloud URL: ${CONVEX_URL}`);
console.log(`Convex Site URL:  ${CONVEX_SITE_URL}\n`);

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

function sha256Hex(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

async function runPhase31Tests() {
  try {
    // 0. Setup: Create authenticated Admin and Kitchen Staff sessions for testing
    console.log("--- 0. AUTHENTICATION BOOTSTRAP ---");
    const adminEmail = `admin-phase31-${Date.now()}@emberandoak.com`;
    const staffEmail = `staff-phase31-${Date.now()}@emberandoak.com`;
    const testPassword = "SecurePasswordPhase31!";

    // Create Admin user
    const adminSignup = await client.action(api.auth.signIn, {
      provider: "password",
      params: {
        email: adminEmail,
        password: testPassword,
        name: "Phase 3.1 Admin",
        role: "admin",
        flow: "signUp",
      },
    });
    const adminToken = adminSignup!.tokens!.token;

    // Create Staff user
    const staffSignup = await client.action(api.auth.signIn, {
      provider: "password",
      params: {
        email: staffEmail,
        password: testPassword,
        name: "Phase 3.1 Staff",
        role: "kitchen_staff",
        flow: "signUp",
      },
    });
    const staffToken = staffSignup!.tokens!.token;

    assert(Boolean(adminToken && staffToken), "Admin and Staff test accounts created with valid JWTs");

    // =========================================================================
    // GROUP A: QR AND TABLE/CUSTOMER SESSION LIFECYCLE
    // =========================================================================
    console.log("\n--- GROUP A.1: TABLE LOOKUP & PUBLIC FIELD REDACTION ---");

    // Seed test Table 6
    client.setAuth(adminToken);
    const table6StandSecret = "physical-stand-secret-table-6-xyz789";
    const table6Hash = sha256Hex(table6StandSecret);

    const fixtureA = await client.mutation(api.test_helpers.seedTestFixture, {
      tableNumber: 6,
      rawCustomerToken: crypto.randomBytes(32).toString("hex"),
      rawReadCapabilityToken: crypto.randomBytes(32).toString("hex"),
    });

    // Update table 6 with known stand hash
    await client.mutation(api.tables.adminRegenerateTableQrToken, {
      tableId: fixtureA.tableId,
      newQrTokenHash: table6Hash,
    });

    // Test A1.1: Public query getTableBySlug (anonymous)
    client.clearAuth();
    const publicTable = await client.query(api.tables.getTableBySlug, { slug: "table-6" });
    assert(
      publicTable.tableNumber === 6 && publicTable.slug === "table-6" && publicTable.isActive === true,
      "Public Table Query: Returns valid public display fields"
    );
    assert(
      (publicTable as Record<string, unknown>).qrTokenHash === undefined &&
      (publicTable as Record<string, unknown>).legacySupabaseId === undefined,
      "Security Redaction: Public table query strictly redacts qrTokenHash and legacySupabaseId"
    );

    // Test A1.2: Staff listTables query authorization
    let anonListRejected = false;
    try {
      await client.query(api.tables.listTables, {});
    } catch (err: unknown) {
      anonListRejected = getErrorMessage(err).includes("UNAUTHENTICATED");
    }
    assert(anonListRejected, "Authorization Guard: Anonymous caller denied tables.listTables (UNAUTHENTICATED)");

    client.setAuth(staffToken);
    const staffTableList = await client.query(api.tables.listTables, {});
    assert(
      Array.isArray(staffTableList) && staffTableList.some((t) => t.tableNumber === 6),
      "Authorization Permission: Staff caller can view floor table list"
    );

    console.log("\n--- GROUP A.2: SERVER-TO-CONVEX HTTP ACTION (POST /server/sessions/resolve-scan) ---");

    const resolveScanUrl = `${CONVEX_SITE_URL}/server/sessions/resolve-scan`;

    // Test A2.1: Direct browser call with NO Authorization header
    const noAuthRes = await fetch(resolveScanUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tableSlug: "table-6",
        qrToken: table6StandSecret,
        rawCustomerWriteToken: "test",
        rawReadCapabilityToken: "test",
      }),
    });
    assert(noAuthRes.status === 401, "Server Gatekeeper: Direct call without Authorization header REJECTED (HTTP 401)");

    // Test A2.2: Direct browser call with INVALID / FORGED Bearer secret
    const badAuthRes = await fetch(resolveScanUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer forged-attacker-secret-xyz",
      },
      body: JSON.stringify({
        tableSlug: "table-6",
        qrToken: table6StandSecret,
        rawCustomerWriteToken: "test",
        rawReadCapabilityToken: "test",
      }),
    });
    assert(badAuthRes.status === 403, "Server Gatekeeper: Direct call with invalid secret REJECTED (HTTP 403 Forbidden)");

    // Test A2.3: Call with INVALID QR token
    const badQrRes = await fetch(resolveScanUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CONVEX_SERVER_SECRET}`,
      },
      body: JSON.stringify({
        tableSlug: "table-6",
        qrToken: "wrong-tampered-qr-stand-token",
        rawCustomerWriteToken: crypto.randomBytes(32).toString("hex"),
        rawReadCapabilityToken: crypto.randomBytes(32).toString("hex"),
      }),
    });
    const badQrData = (await badQrRes.json()) as { error?: string };
    assert(
      badQrRes.status === 400 && Boolean(badQrData.error?.includes("INVALID_QR_TOKEN")),
      "QR Integrity: Tampered/invalid stand secret REJECTED with INVALID_QR_TOKEN"
    );

    // Test A2.4: Call for an INACTIVE table
    client.setAuth(adminToken);
    await client.mutation(api.tables.adminToggleTableActive, {
      tableId: fixtureA.tableId,
      isActive: false,
    });

    const inactiveTableRes = await fetch(resolveScanUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CONVEX_SERVER_SECRET}`,
      },
      body: JSON.stringify({
        tableSlug: "table-6",
        qrToken: table6StandSecret,
        rawCustomerWriteToken: crypto.randomBytes(32).toString("hex"),
        rawReadCapabilityToken: crypto.randomBytes(32).toString("hex"),
      }),
    });
    const inactiveData = (await inactiveTableRes.json()) as { error?: string };
    assert(
      inactiveTableRes.status === 400 && Boolean(inactiveData.error?.includes("TABLE_INACTIVE")),
      "Lifecycle Guard: Scan against out-of-service table REJECTED with TABLE_INACTIVE"
    );

    // Reactivate table 6
    await client.mutation(api.tables.adminToggleTableActive, {
      tableId: fixtureA.tableId,
      isActive: true,
    });

    // Test A2.5: Legitimate scan resolution
    const validRawWriteToken = crypto.randomBytes(32).toString("hex");
    const validRawReadToken = crypto.randomBytes(32).toString("hex");

    const validScanRes = await fetch(resolveScanUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CONVEX_SERVER_SECRET}`,
      },
      body: JSON.stringify({
        tableSlug: "table-6",
        qrToken: table6StandSecret,
        rawCustomerWriteToken: validRawWriteToken,
        rawReadCapabilityToken: validRawReadToken,
      }),
    });

    assert(validScanRes.status === 200, "Scan Resolution: Legitimate scan resolved successfully (HTTP 200)");
    const validScanData = (await validScanRes.json()) as {
      tableOrderSessionId: Id<"tableOrderSessions">;
      customerScanSessionId: Id<"customerScanSessions">;
      customerTokenHash?: string;
      readCapabilityTokenHash?: string;
    };
    assert(
      Boolean(validScanData.tableOrderSessionId && validScanData.customerScanSessionId),
      "Session Creation: Returns tableOrderSessionId and customerScanSessionId",
      `Session ID: ${validScanData.tableOrderSessionId}`
    );
    assert(
      validScanData.customerTokenHash === undefined && validScanData.readCapabilityTokenHash === undefined,
      "Security Redaction: Server response redacts all token hashes"
    );

    console.log("\n--- GROUP A.3: OCC CONCURRENCY & SESSION REUSE ---");

    // Test A3.1: 5 simultaneous scans on Table 6 resolve to the identical tableOrderSessionId
    const concurrentScanPromises = Array.from({ length: 5 }).map(() =>
      fetch(resolveScanUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${CONVEX_SERVER_SECRET}`,
        },
        body: JSON.stringify({
          tableSlug: "table-6",
          qrToken: table6StandSecret,
          rawCustomerWriteToken: crypto.randomBytes(32).toString("hex"),
          rawReadCapabilityToken: crypto.randomBytes(32).toString("hex"),
        }),
      }).then((r) => r.json() as Promise<{ tableOrderSessionId: string }>)
    );

    const concurrentData = await Promise.all(concurrentScanPromises);
    const sessionIds = concurrentData.map((d) => d.tableOrderSessionId);
    const allSameSession = sessionIds.every((id: string) => id === sessionIds[0]);

    assert(
      allSameSession && sessionIds[0] === validScanData.tableOrderSessionId,
      "OCC Concurrency & Reuse: All concurrent scans attached to the existing active table session (zero duplicates)",
      `Unified Session ID: ${sessionIds[0]}`
    );

    console.log("\n--- GROUP A.4: CUSTOMER STATUS, EXPIRATION & REVOCATION ---");

    // Test A4.1: Customer status reactive query with valid capability
    client.clearAuth();
    const customerStatus = await client.query(api.sessions.getCustomerSessionStatus, {
      customerScanSessionId: validScanData.customerScanSessionId,
      rawReadCapabilityToken: validRawReadToken,
    });
    assert(
      customerStatus.sessionStatus === "ACTIVE" && customerStatus.tableNumber === 6 && customerStatus.scanSessionActive === true,
      "Customer Status Query: Valid capability token returns active dining status"
    );
    assert(
      (customerStatus as Record<string, unknown>).customerTokenHash === undefined &&
      (customerStatus as Record<string, unknown>).readCapabilityTokenHash === undefined,
      "Security Redaction: Customer status query strictly redacts token hashes"
    );

    // Test A4.2: Invalid read capability token rejected
    let badReadRejected = false;
    try {
      await client.query(api.sessions.getCustomerSessionStatus, {
        customerScanSessionId: validScanData.customerScanSessionId,
        rawReadCapabilityToken: "forged-tampered-read-token-xyz",
      });
    } catch (err: unknown) {
      badReadRejected = getErrorMessage(err).includes("UNAUTHORIZED");
    }
    assert(badReadRejected, "Token Validation: Tampered read capability token REJECTED (UNAUTHORIZED)");

    // Test A4.3: Session expiration
    client.setAuth(adminToken);
    await client.mutation(api.sessions.internalSetCustomerSessionState, {
      customerScanSessionId: validScanData.customerScanSessionId,
      isActive: true,
      isExpired: true,
      isRevoked: false,
    });

    client.clearAuth();
    let expiredRejected = false;
    try {
      await client.query(api.sessions.getCustomerSessionStatus, {
        customerScanSessionId: validScanData.customerScanSessionId,
        rawReadCapabilityToken: validRawReadToken,
      });
    } catch (err: unknown) {
      expiredRejected = getErrorMessage(err).includes("SESSION_EXPIRED");
    }
    assert(expiredRejected, "Lifecycle Guard: Expired customer scan session REJECTED (SESSION_EXPIRED)");

    // Test A4.4: Session revocation via staff mutation
    client.setAuth(staffToken);
    await client.mutation(api.sessions.revokeCustomerScanSession, {
      customerScanSessionId: validScanData.customerScanSessionId,
    });

    client.clearAuth();
    let revokedRejected = false;
    try {
      await client.query(api.sessions.getCustomerSessionStatus, {
        customerScanSessionId: validScanData.customerScanSessionId,
        rawReadCapabilityToken: validRawReadToken,
      });
    } catch (err: unknown) {
      revokedRejected = getErrorMessage(err).includes("UNAUTHORIZED");
    }
    assert(revokedRejected, "Lifecycle Guard: Staff-revoked customer scan session REJECTED (UNAUTHORIZED)");

    // =========================================================================
    // GROUP B: MENU CATALOG AND ADMINISTRATION
    // =========================================================================
    console.log("\n--- GROUP B.1: CATEGORY ADMINISTRATION & AUTHORIZATION ---");

    // Test B1.1: Non-admin caller attempting createCategory
    client.setAuth(staffToken);
    let staffCategoryRejected = false;
    try {
      await client.mutation(api.categories.createCategory, {
        name: "Artisan Pastries",
        slug: "artisan-pastries",
        displayOrder: 2,
      });
    } catch (err: unknown) {
      staffCategoryRejected = getErrorMessage(err).includes("Administrator privileges required");
    }
    assert(staffCategoryRejected, "Role Guard: Kitchen staff attempting to create category REJECTED (requireAdmin)");

    // Test B1.2: Invalid inputs (short name, invalid slug)
    client.setAuth(adminToken);
    let shortNameRejected = false;
    try {
      await client.mutation(api.categories.createCategory, {
        name: "A",
        slug: "valid-slug",
        displayOrder: 1,
      });
    } catch (err: unknown) {
      shortNameRejected = getErrorMessage(err).includes("INVALID_CATEGORY_NAME");
    }
    assert(shortNameRejected, "Input Validation: Category name under 2 characters REJECTED");

    // Test B1.3: Admin successfully creates category
    const uniqueOakSlug = `oak-teas-${Date.now()}`;
    const catResult = await client.mutation(api.categories.createCategory, {
      name: "Oak Brewed Teas",
      slug: uniqueOakSlug,
      displayOrder: 2,
      isActive: true,
    });
    assert(catResult.success && Boolean(catResult.categoryId), "Admin CRUD: Admin successfully created menu category");

    // Test B1.4: Duplicate slug rejected
    let dupSlugRejected = false;
    try {
      await client.mutation(api.categories.createCategory, {
        name: "Duplicate Oak Teas",
        slug: uniqueOakSlug, // Deliberately duplicate the slug that was just registered
        displayOrder: 3,
      });
    } catch (err: unknown) {
      dupSlugRejected = getErrorMessage(err).includes("CATEGORY_SLUG_EXISTS");
    }
    assert(dupSlugRejected, "Constraint Validation: Duplicate category slug REJECTED");

    console.log("\n--- GROUP B.2: MENU ITEM ADMINISTRATION & INTEGER-PAISE PRICING ---");

    // Test B2.1: Staff attempting to create menu item
    client.setAuth(staffToken);
    let staffItemRejected = false;
    try {
      await client.mutation(api.menu.createMenuItem, {
        categoryId: catResult.categoryId,
        name: "Earl Grey Reserve",
        pricePaise: 28000,
        displayOrder: 1,
      });
    } catch (err: unknown) {
      staffItemRejected = getErrorMessage(err).includes("Administrator privileges required");
    }
    assert(staffItemRejected, "Role Guard: Kitchen staff attempting to create menu item REJECTED (requireAdmin)");

    // Test B2.2: Invalid price validations (0, negative, float)
    client.setAuth(adminToken);
    let zeroPriceRejected = false;
    try {
      await client.mutation(api.menu.createMenuItem, {
        categoryId: catResult.categoryId,
        name: "Free Tea",
        pricePaise: 0,
        displayOrder: 1,
      });
    } catch (err: unknown) {
      zeroPriceRejected = getErrorMessage(err).includes("INVALID_PRICE");
    }
    assert(zeroPriceRejected, "Money Integrity: Zero price in paise REJECTED (must be > 0)");

    let floatPriceRejected = false;
    try {
      await client.mutation(api.menu.createMenuItem, {
        categoryId: catResult.categoryId,
        name: "Fractional Tea",
        pricePaise: 250.75, // Fractional paise
        displayOrder: 1,
      });
    } catch (err: unknown) {
      floatPriceRejected = getErrorMessage(err).includes("INVALID_PRICE");
    }
    assert(floatPriceRejected, "Money Integrity: Fractional paise price REJECTED (must be integer)");

    // Test B2.3: Admin creates valid item with integer paise (₹280 = 28000 paise)
    const itemResult = await client.mutation(api.menu.createMenuItem, {
      categoryId: catResult.categoryId,
      name: "Smoked Earl Grey",
      description: "Organic black tea with bergamot and oak smoke",
      pricePaise: 28000,
      imageUrl: "https://pub-r2.emberandoak.cafe/tea-earl-grey.webp",
      isAvailable: true,
      requiresAgeConfirmation: false,
      displayOrder: 1,
    });
    assert(itemResult.success && Boolean(itemResult.menuItemId), "Admin CRUD: Admin successfully created menu item (₹280 = 28000 paise)");

    // Test B2.4: Admin cannot delete category while it has menu items
    let inUseRejected = false;
    try {
      await client.mutation(api.categories.deleteCategory, { categoryId: catResult.categoryId });
    } catch (err: unknown) {
      inUseRejected = getErrorMessage(err).includes("CATEGORY_IN_USE");
    }
    assert(inUseRejected, "Referential Integrity: Deleting category with active menu items REJECTED (CATEGORY_IN_USE)");

    console.log("\n--- GROUP B.3: STAFF AVAILABILITY & IMMUTABLE RESTRICTIONS ---");

    // Test B3.1: Kitchen staff CAN toggle item availability
    client.setAuth(staffToken);
    const toggleOff = await client.mutation(api.menu.toggleItemAvailability, {
      menuItemId: itemResult.menuItemId,
      isAvailable: false,
    });
    assert(toggleOff.success && toggleOff.isAvailable === false, "Staff 86 Toggle: Kitchen staff successfully marked item out of stock");

    // Test B3.2: Staff CANNOT modify price, description, or category
    // toggleItemAvailability only accepts { menuItemId, isAvailable }.
    // If staff attempts to call updateMenuItem to change the price:
    let staffPriceUpdateRejected = false;
    try {
      await client.mutation(api.menu.updateMenuItem, {
        menuItemId: itemResult.menuItemId,
        pricePaise: 10000, // Attacker trying to drop price to ₹100
      });
    } catch (err: unknown) {
      staffPriceUpdateRejected = getErrorMessage(err).includes("Administrator privileges required");
    }
    assert(
      staffPriceUpdateRejected,
      "Price Protection: Staff caller attempting to alter price on updateMenuItem was REJECTED"
    );

    console.log("\n--- GROUP B.4: PUBLIC MENU ACCESS & REALTIME REFLECTION ---");

    // Test B4.1: Public menu does NOT show unavailable (86'd) item
    client.clearAuth();
    const publicMenuWhile86 = await client.query(api.menu.getPublicMenu, {});
    const targetCatWhile86 = publicMenuWhile86.find((c) => c._id === catResult.categoryId);
    const itemPresentWhile86 = targetCatWhile86?.items.some((i) => i._id === itemResult.menuItemId);
    assert(!itemPresentWhile86, "Realtime Availability: Item marked out of stock is EXCLUDED from public menu");

    // Test B4.2: Staff toggles item back to available
    client.setAuth(staffToken);
    await client.mutation(api.menu.toggleItemAvailability, {
      menuItemId: itemResult.menuItemId,
      isAvailable: true,
    });

    // Test B4.3: Public menu immediately includes the item again
    client.clearAuth();
    const publicMenuAvailable = await client.query(api.menu.getPublicMenu, {});
    const targetCatAvailable = publicMenuAvailable.find((c) => c._id === catResult.categoryId);
    const activeItem = targetCatAvailable?.items.find((i) => i._id === itemResult.menuItemId);

    assert(Boolean(activeItem), "Realtime Availability: Item toggled back in stock immediately RE-APPEARS in public menu");
    assert(activeItem?.pricePaise === 28000, "Money Accuracy: Public item displays exact authoritative price in paise (28000)");
    assert(
      (activeItem as Record<string, unknown>).legacySupabaseId === undefined &&
      (activeItem as Record<string, unknown>).createdAt === undefined,
      "Security Redaction: Public menu query strictly redacts internal timestamps and legacySupabaseId"
    );

    console.log("\n==================================================================");
    console.log(`  PHASE 3.1 TEST SUITE RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
    console.log("==================================================================");

    if (failedCount > 0) {
      process.exit(1);
    }
  } catch (fatalError: unknown) {
    console.error("FATAL TEST SUITE ERROR:", fatalError);
    process.exit(1);
  }
}

runPhase31Tests();
