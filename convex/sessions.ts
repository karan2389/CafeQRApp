import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { requireStaff, requireAdmin, validateCustomerReadCapability, sha256Hex } from "./auth_helpers";

const SESSION_WINDOW_MS = 12 * 60 * 60 * 1000; // 12-hour sliding window

/**
 * Internal mutation for atomic QR resolution and session initialization.
 * Executed strictly via trusted Next.js server route or HTTP action.
 *
 * Security:
 * 1. Validates table existence, active state, and QR token hash.
 * 2. Uses Convex OCC to atomically get-or-create the single ACTIVE table session.
 * 3. Hashes rawCustomerWriteToken (for HttpOnly cookie) and rawReadCapabilityToken.
 * 4. Stores ONLY SHA-256 hashes in the database.
 * 5. Returns clean identifiers without exposing raw secrets.
 */
export const resolveTableScanInternal = internalMutation({
  args: {
    tableSlug: v.string(),
    qrToken: v.string(),
    rawCustomerWriteToken: v.string(),
    rawReadCapabilityToken: v.string(),
  },
  handler: async (ctx, args) => {
    // 1. Look up table
    const table = await ctx.db
      .query("tables")
      .withIndex("by_slug", (q) => q.eq("slug", args.tableSlug))
      .first();

    if (!table) {
      throw new Error("TABLE_NOT_FOUND: Dining table not found.");
    }

    if (!table.isActive) {
      throw new Error("TABLE_INACTIVE: This table is currently out of service.");
    }

    // 2. Validate physical QR stand secret
    const incomingQrHash = await sha256Hex(args.qrToken);
    if (incomingQrHash !== table.qrTokenHash) {
      throw new Error("INVALID_QR_TOKEN: Invalid or tampered table QR code.");
    }

    // 3. Atomically get or create active tableOrderSession (OCC Protected)
    const now = Date.now();
    let tableOrderSession = await ctx.db
      .query("tableOrderSessions")
      .withIndex("by_table_and_status", (q) =>
        q.eq("tableId", table._id).eq("status", "ACTIVE")
      )
      .first();

    if (!tableOrderSession) {
      const newSessionId = await ctx.db.insert("tableOrderSessions", {
        tableId: table._id,
        tableNumber: table.tableNumber,
        status: "ACTIVE",
        openedAt: now,
      });
      tableOrderSession = await ctx.db.get(newSessionId);
    }

    if (!tableOrderSession) {
      throw new Error("SESSION_CREATION_FAILED: Failed to initialize dining table session.");
    }

    // 4. Compute cryptographic hashes for two-tier customer session
    const customerTokenHash = await sha256Hex(args.rawCustomerWriteToken);
    const readCapabilityTokenHash = await sha256Hex(args.rawReadCapabilityToken);
    const expiresAt = now + SESSION_WINDOW_MS;

    const customerScanSessionId = await ctx.db.insert("customerScanSessions", {
      tableId: table._id,
      tableOrderSessionId: tableOrderSession._id,
      customerTokenHash,
      readCapabilityTokenHash,
      createdAt: now,
      expiresAt,
      isActive: true,
    });

    return {
      tableId: table._id,
      tableNumber: table.tableNumber,
      displayName: table.displayName,
      slug: table.slug,
      tableOrderSessionId: tableOrderSession._id,
      customerScanSessionId,
      expiresAt,
    };
  },
});

/**
 * Public reactive query for customer dining session status.
 * Requires valid read capability token.
 * Never exposes token hashes.
 */
export const getCustomerSessionStatus = query({
  args: {
    customerScanSessionId: v.id("customerScanSessions"),
    rawReadCapabilityToken: v.string(),
  },
  handler: async (ctx, args) => {
    const { scanSession, tableOrderSession } = await validateCustomerReadCapability(
      ctx,
      args.customerScanSessionId,
      args.rawReadCapabilityToken
    );

    return {
      tableNumber: tableOrderSession.tableNumber,
      sessionStatus: tableOrderSession.status,
      openedAt: tableOrderSession.openedAt,
      scanSessionActive: scanSession.isActive,
      expiresAt: scanSession.expiresAt,
    };
  },
});

/**
 * Staff mutation to explicitly revoke an active customer scan session.
 * Guarded strictly by requireStaff.
 */
export const revokeCustomerScanSession = mutation({
  args: {
    customerScanSessionId: v.id("customerScanSessions"),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx);

    const scanSession = await ctx.db.get(args.customerScanSessionId);
    if (!scanSession) {
      throw new Error("SESSION_NOT_FOUND: Customer scan session not found.");
    }

    const now = Date.now();
    await ctx.db.patch(args.customerScanSessionId, {
      isActive: false,
      revokedAt: now,
    });

    return { success: true, customerScanSessionId: args.customerScanSessionId, revokedAt: now };
  },
});

/**
 * Admin helper to expire or alter a customer scan session for automated lifecycle testing.
 * Strictly guarded by requireAdmin.
 */
export const internalSetCustomerSessionState = mutation({
  args: {
    customerScanSessionId: v.id("customerScanSessions"),
    isActive: v.boolean(),
    isExpired: v.boolean(),
    isRevoked: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const now = Date.now();
    await ctx.db.patch(args.customerScanSessionId, {
      isActive: args.isActive,
      expiresAt: args.isExpired ? now - 1000 : now + SESSION_WINDOW_MS,
      revokedAt: args.isRevoked ? now : undefined,
    });
  },
});

/**
 * Staff-only query to fetch all active table sessions.
 * Returns table sessions currently in "ACTIVE" state with order and billing summaries.
 * Guarded strictly by requireStaff (kitchen staff and admin).
 */
export const getActiveTableSessions = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);

    const activeSessions = await ctx.db
      .query("tableOrderSessions")
      .withIndex("by_status", (q) => q.eq("status", "ACTIVE"))
      .collect();

    const results = await Promise.all(
      activeSessions.map(async (session) => {
        const table = await ctx.db.get(session.tableId);
        const orders = await ctx.db
          .query("orders")
          .withIndex("by_table_session", (q) =>
            q.eq("tableOrderSessionId", session._id)
          )
          .collect();

        const deliveredOrders = orders.filter((o) => o.status === "DELIVERED" || o.status === "PAID");
        const unfinishedOrders = orders.filter(
          (o) => o.status === "NEW" || o.status === "PREPARING" || o.status === "PENDING"
        );
        const cancelledOrders = orders.filter((o) => o.status === "CANCELLED");

        const runningBillPaise = deliveredOrders.reduce((sum, o) => sum + o.totalAmountPaise, 0);
        const pendingBillPaise = unfinishedOrders.reduce((sum, o) => sum + o.totalAmountPaise, 0);

        return {
          _id: session._id,
          tableId: session.tableId,
          tableNumber: session.tableNumber,
          displayName: table?.displayName ?? `Table ${session.tableNumber}`,
          tableIsActive: table?.isActive ?? true,
          status: session.status,
          openedAt: session.openedAt,
          totalOrdersCount: orders.length,
          deliveredOrdersCount: deliveredOrders.length,
          unfinishedOrdersCount: unfinishedOrders.length,
          cancelledOrdersCount: cancelledOrders.length,
          runningBillPaise,
          runningBillInr: runningBillPaise / 100,
          pendingBillPaise,
          pendingBillInr: pendingBillPaise / 100,
          isReadyForClosure: unfinishedOrders.length === 0,
        };
      })
    );

    return results.sort((a, b) => a.tableNumber - b.tableNumber);
  },
});
