import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import {
  requireAdmin,
  requireStaff,
  validateCustomerReadCapability,
  validateCustomerWriteSession,
  sha256Hex,
} from "./auth_helpers";

/**
 * Admin-only mutation test target.
 * Asserts requireAdmin guard rejects any non-admin caller.
 */
export const testAdminOnlyMutation = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireAdmin(ctx);
    return { success: true, adminEmail: user.email };
  },
});

/**
 * Staff-only mutation test target.
 * Asserts requireStaff guard rejects non-staff callers.
 */
export const testStaffOnlyMutation = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireStaff(ctx);
    return { success: true, staffEmail: user.email, role: user.role };
  },
});

/**
 * Atomic get-or-create dining table session.
 * Enforces single active session per table using Convex OCC concurrency control.
 * If multiple callers invoke concurrently, Convex detects the read-write conflict
 * on index "by_table_and_status", retries the conflicting transactions, and guarantees
 * exactly ONE session is created while all callers receive that session's ID.
 */
export const getOrCreateTableSession = mutation({
  args: {
    tableId: v.id("tables"),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("tableOrderSessions")
      .withIndex("by_table_and_status", (q) =>
        q.eq("tableId", args.tableId).eq("status", "ACTIVE")
      )
      .first();

    if (existing) {
      return existing._id;
    }

    const table = await ctx.db.get(args.tableId);
    if (!table) {
      throw new Error("TABLE_NOT_FOUND: Specified table does not exist.");
    }

    const sessionId = await ctx.db.insert("tableOrderSessions", {
      tableId: args.tableId,
      tableNumber: table.tableNumber,
      status: "ACTIVE",
      openedAt: Date.now(),
    });

    return sessionId;
  },
});

/**
 * Customer order submission mutation.
 * 1. Validates customer session via customerTokenHash (from HttpOnly cookie).
 * 2. Fetches authoritative menu item prices from the database (tamper-proof).
 * 3. Client prices are completely ignored and cannot manipulate order total.
 */
export const testSubmitCustomerOrder = mutation({
  args: {
    customerTokenHash: v.string(),
    items: v.array(
      v.object({
        menuItemId: v.id("menuItems"),
        quantity: v.number(),
      })
    ),
    clientAttemptedTotalPaise: v.optional(v.number()), // Optional parameter to detect price manipulation attempts
  },
  handler: async (ctx, args) => {
    const { scanSession, tableOrderSession } = await validateCustomerWriteSession(
      ctx,
      args.customerTokenHash
    );

    let calculatedTotalPaise = 0;
    const orderItemsToInsert: Array<{
      menuItemId: typeof args.items[0]["menuItemId"];
      itemName: string;
      unitPricePaise: number;
      quantity: number;
      itemTotalPaise: number;
    }> = [];

    for (const item of args.items) {
      const menuItem = await ctx.db.get(item.menuItemId);
      if (!menuItem || !menuItem.isAvailable) {
        throw new Error(`ITEM_UNAVAILABLE: Menu item ${item.menuItemId} is unavailable.`);
      }

      const itemTotalPaise = menuItem.pricePaise * item.quantity;
      calculatedTotalPaise += itemTotalPaise;

      orderItemsToInsert.push({
        menuItemId: item.menuItemId,
        itemName: menuItem.name,
        unitPricePaise: menuItem.pricePaise,
        quantity: item.quantity,
        itemTotalPaise,
      });
    }

    // Explicit rejection if client attempted price manipulation
    if (
      args.clientAttemptedTotalPaise !== undefined &&
      args.clientAttemptedTotalPaise !== calculatedTotalPaise
    ) {
      throw new Error(
        `PRICE_MANIPULATION_DETECTED: Client claimed total ₹${args.clientAttemptedTotalPaise / 100} does not match authoritative menu price ₹${calculatedTotalPaise / 100}.`
      );
    }

    const now = Date.now();
    const orderId = await ctx.db.insert("orders", {
      orderNumber: `#TEST-${Math.floor(1000 + Math.random() * 9000)}`,
      tableOrderSessionId: tableOrderSession._id,
      tableId: tableOrderSession.tableId,
      tableNumber: tableOrderSession.tableNumber,
      customerScanSessionId: scanSession._id,
      status: "NEW",
      totalAmountPaise: calculatedTotalPaise,
      placedAt: now,
      statusUpdatedAt: now,
    });

    for (const lineItem of orderItemsToInsert) {
      await ctx.db.insert("orderItems", {
        orderId,
        menuItemId: lineItem.menuItemId,
        itemName: lineItem.itemName,
        unitPricePaise: lineItem.unitPricePaise,
        quantity: lineItem.quantity,
        itemTotalPaise: lineItem.itemTotalPaise,
        createdAt: now,
      });
    }

    return { orderId, totalAmountPaise: calculatedTotalPaise };
  },
});

/**
 * Staff-only table session closure mutation.
 * Rejects any caller without authenticated staff or admin privileges.
 * Customers cannot close their own bill.
 */
export const testCloseTableSession = mutation({
  args: {
    tableOrderSessionId: v.id("tableOrderSessions"),
    paymentMethod: v.union(v.literal("CASH"), v.literal("CARD"), v.literal("UPI"), v.literal("OTHER")),
  },
  handler: async (ctx, args) => {
    const user = await requireStaff(ctx);

    const session = await ctx.db.get(args.tableOrderSessionId);
    if (!session) {
      throw new Error("SESSION_NOT_FOUND: Table session not found.");
    }

    if (session.status === "CLOSED") {
      throw new Error("SESSION_ALREADY_CLOSED: Table session is already settled.");
    }

    const now = Date.now();
    await ctx.db.patch(args.tableOrderSessionId, {
      status: "CLOSED",
      closedAt: now,
      closedByUserId: user._id,
      paymentConfirmedAt: now,
      paymentConfirmedByUserId: user._id,
      paymentMethod: args.paymentMethod,
    });

    return { success: true, closedBy: user.email, closedAt: now };
  },
});

/**
 * Customer live-tracking query test target.
 * Validates read capability token and verifies caller cannot query cross-table sessions.
 */
export const testGetTableOrders = query({
  args: {
    customerScanSessionId: v.id("customerScanSessions"),
    rawReadCapabilityToken: v.string(),
    targetTableOrderSessionId: v.id("tableOrderSessions"),
  },
  handler: async (ctx, args) => {
    const { scanSession, tableOrderSession } = await validateCustomerReadCapability(
      ctx,
      args.customerScanSessionId,
      args.rawReadCapabilityToken
    );

    // Cross-table isolation check: assert requested table session matches authorized session
    if (args.targetTableOrderSessionId !== scanSession.tableOrderSessionId) {
      throw new Error(
        "UNAUTHORIZED: Cross-table access denied. You cannot access orders from another table."
      );
    }

    const orders = await ctx.db
      .query("orders")
      .withIndex("by_table_session", (q) =>
        q.eq("tableOrderSessionId", tableOrderSession._id)
      )
      .collect();

    return { sessionStatus: tableOrderSession.status, orders };
  },
});

/**
 * Fixture setup helper for automated verification tests.
 */
export const seedTestFixture = mutation({
  args: {
    tableNumber: v.number(),
    rawCustomerToken: v.string(),
    rawReadCapabilityToken: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // 1. Table (re-use or clean up duplicate fixtures from prior test runs)
    const qrTokenHash = await sha256Hex(`table-${args.tableNumber}-secret`);
    const tableSlug = `table-${args.tableNumber}`;
    const existingTables = await ctx.db
      .query("tables")
      .withIndex("by_slug", (q) => q.eq("slug", tableSlug))
      .collect();

    let tableId: Id<"tables">;
    if (existingTables.length > 0) {
      tableId = existingTables[0]._id;
      await ctx.db.patch(tableId, {
        tableNumber: args.tableNumber,
        displayName: `Table ${args.tableNumber}`,
        isActive: true,
        qrTokenHash,
        updatedAt: now,
      });
      // Delete any duplicate tables from prior runs
      for (let i = 1; i < existingTables.length; i++) {
        await ctx.db.delete(existingTables[i]._id);
      }
    } else {
      tableId = await ctx.db.insert("tables", {
        tableNumber: args.tableNumber,
        displayName: `Table ${args.tableNumber}`,
        slug: tableSlug,
        isActive: true,
        qrTokenHash,
        createdAt: now,
        updatedAt: now,
      });
    }

    // 2. Table Session (close previous active sessions for this table)
    const existingActiveSessions = await ctx.db
      .query("tableOrderSessions")
      .withIndex("by_table_and_status", (q) =>
        q.eq("tableId", tableId).eq("status", "ACTIVE")
      )
      .collect();
    for (const s of existingActiveSessions) {
      await ctx.db.patch(s._id, { status: "CLOSED", closedAt: now });
    }

    const tableOrderSessionId = await ctx.db.insert("tableOrderSessions", {
      tableId,
      tableNumber: args.tableNumber,
      status: "ACTIVE",
      openedAt: now,
    });

    // 3. Customer Scan Session
    const customerTokenHash = await sha256Hex(args.rawCustomerToken);
    const readCapabilityTokenHash = await sha256Hex(args.rawReadCapabilityToken);
    const customerScanSessionId = await ctx.db.insert("customerScanSessions", {
      tableId,
      tableOrderSessionId,
      customerTokenHash,
      readCapabilityTokenHash,
      createdAt: now,
      expiresAt: now + 12 * 60 * 60 * 1000, // 12 hours
      isActive: true,
    });

    // 4. Menu Category (reuse existing if present)
    const existingCat = await ctx.db
      .query("menuCategories")
      .withIndex("by_slug", (q) => q.eq("slug", "coffee-specialties"))
      .first();

    let categoryId = existingCat?._id;
    if (!categoryId) {
      categoryId = await ctx.db.insert("menuCategories", {
        name: "Coffee Specialties",
        slug: "coffee-specialties",
        displayOrder: 1,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
    }

    // 5. Menu Item (Authoritative Price: ₹350 = 35000 paise)
    const existingItem = await ctx.db
      .query("menuItems")
      .withIndex("by_category", (q) => q.eq("categoryId", categoryId!))
      .filter((q) => q.eq(q.field("name"), "Oak Reserve Cappuccino"))
      .first();

    let menuItemId = existingItem?._id;
    if (!menuItemId) {
      menuItemId = await ctx.db.insert("menuItems", {
        categoryId,
        name: "Oak Reserve Cappuccino",
        description: "Artisan espresso with steamed milk",
        pricePaise: 35000,
        isAvailable: true,
        requiresAgeConfirmation: false,
        displayOrder: 1,
        createdAt: now,
        updatedAt: now,
      });
    }

    return {
      tableId,
      tableOrderSessionId,
      customerScanSessionId,
      menuItemId,
      customerTokenHash,
      readCapabilityTokenHash,
    };
  },
});

/**
 * Fixture modification helper to test deactivated users.
 */
export const setUserActiveStatus = mutation({
  args: {
    userId: v.id("users"),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, { isActive: args.isActive, updatedAt: Date.now() });
  },
});

/**
 * Fixture modification helper to test expired/revoked customer capabilities.
 */
export const setCustomerSessionState = mutation({
  args: {
    customerScanSessionId: v.id("customerScanSessions"),
    isActive: v.boolean(),
    isExpired: v.boolean(),
    isRevoked: v.boolean(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.customerScanSessionId, {
      isActive: args.isActive,
      expiresAt: args.isExpired ? now - 1000 : now + 12 * 60 * 60 * 1000,
      revokedAt: args.isRevoked ? now : undefined,
    });
  },
});

/**
 * Count active sessions for a table.
 */
export const countActiveSessionsForTable = query({
  args: {
    tableId: v.id("tables"),
  },
  handler: async (ctx, args) => {
    const sessions = await ctx.db
      .query("tableOrderSessions")
      .withIndex("by_table_and_status", (q) =>
        q.eq("tableId", args.tableId).eq("status", "ACTIVE")
      )
      .collect();
    return sessions.length;
  },
});

