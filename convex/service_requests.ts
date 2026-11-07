import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import {
  requireStaff,
  validateCustomerWriteSession,
  validateCustomerReadCapability,
  sha256Hex,
} from "./auth_helpers";

const SERVICE_REQUEST_COOLDOWN_MS = 30 * 1000; // 30-second anti-spam cooldown per table

/**
 * Internal mutation to create a customer service request (e.g. Call Staff, Request Water, Request Bill).
 * Executed strictly via trusted Next.js server HTTP Action (POST /server/service-requests/create).
 *
 * Security & Anti-Spam:
 * 1. Validates customer write session via SHA-256 hash of HttpOnly cookie token.
 * 2. Asserts linked table order session is ACTIVE.
 * 3. Prevents duplicate active requests: Rejects if an unhandled request of the same type is open.
 * 4. Enforces 30-second cooldown window per dining table.
 */
export const createServiceRequestInternal = internalMutation({
  args: {
    rawCustomerWriteToken: v.string(),
    requestType: v.union(
      v.literal("CALL_STAFF"),
      v.literal("REQUEST_WATER"),
      v.literal("REQUEST_BILL"),
      v.literal("REQUEST_ASSISTANCE")
    ),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // 1. Authenticate customer write session
    const customerTokenHash = await sha256Hex(args.rawCustomerWriteToken);
    const { scanSession, tableOrderSession } = await validateCustomerWriteSession(
      ctx,
      customerTokenHash
    );

    // 2. Validate table session active status
    if (tableOrderSession.status !== "ACTIVE") {
      throw new Error("SESSION_CLOSED: Table dining session is closed. Cannot request assistance.");
    }

    const now = Date.now();

    // 3. Query existing active requests for this table
    const existingRequests = await ctx.db
      .query("serviceRequests")
      .withIndex("by_table_session", (q) =>
        q.eq("tableOrderSessionId", tableOrderSession._id)
      )
      .order("desc")
      .take(10);

    // Duplicate prevention: check for unhandled request of the identical type
    const hasActiveSameType = existingRequests.some(
      (r) =>
        r.requestType === args.requestType &&
        (r.status === "OPEN" || r.status === "ACKNOWLEDGED")
    );

    if (hasActiveSameType) {
      throw new Error(
        `ACTIVE_REQUEST_EXISTS: A ${args.requestType.replace("_", " ").toLowerCase()} request is already pending for your table.`
      );
    }

    // Cooldown check: prevent button mashing across different request types
    const mostRecent = existingRequests[0];
    if (mostRecent && now - mostRecent.createdAt < SERVICE_REQUEST_COOLDOWN_MS) {
      const waitSec = Math.ceil((SERVICE_REQUEST_COOLDOWN_MS - (now - mostRecent.createdAt)) / 1000);
      throw new Error(
        `COOLDOWN_ACTIVE: Please wait ${waitSec} seconds before submitting another request.`
      );
    }

    // 4. Insert new service request
    const requestId = await ctx.db.insert("serviceRequests", {
      tableId: tableOrderSession.tableId,
      tableOrderSessionId: tableOrderSession._id,
      customerScanSessionId: scanSession._id,
      tableNumber: tableOrderSession.tableNumber,
      requestType: args.requestType,
      note: args.note?.trim() || undefined,
      status: "OPEN",
      createdAt: now,
      updatedAt: now,
    });

    return {
      success: true,
      requestId,
      tableNumber: tableOrderSession.tableNumber,
      requestType: args.requestType,
      status: "OPEN",
      createdAt: now,
    };
  },
});

/**
 * Public reactive query for customer-facing service requests.
 * Allows diners to track the status of their assistance requests in real time.
 */
export const getCustomerServiceRequests = query({
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

    const requests = await ctx.db
      .query("serviceRequests")
      .withIndex("by_table_session", (q) =>
        q.eq("tableOrderSessionId", tableOrderSession._id)
      )
      .order("desc")
      .collect();

    return requests.map((r) => ({
      _id: r._id,
      tableNumber: r.tableNumber,
      requestType: r.requestType,
      note: r.note,
      status: r.status,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      isCurrentDevice: r.customerScanSessionId === scanSession._id,
    }));
  },
});

/**
 * Staff-only query to monitor active service requests on the dining floor.
 * Guarded strictly by requireStaff.
 */
export const getActiveServiceRequests = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);

    const openRequests = await ctx.db
      .query("serviceRequests")
      .withIndex("by_status_and_time", (q) => q.eq("status", "OPEN"))
      .order("asc")
      .collect();

    const ackRequests = await ctx.db
      .query("serviceRequests")
      .withIndex("by_status_and_time", (q) => q.eq("status", "ACKNOWLEDGED"))
      .order("asc")
      .collect();

    return [...openRequests, ...ackRequests].sort((a, b) => a.createdAt - b.createdAt);
  },
});

/**
 * Staff mutation to acknowledge a service request.
 * Guarded strictly by requireStaff.
 */
export const acknowledgeServiceRequest = mutation({
  args: {
    requestId: v.id("serviceRequests"),
  },
  handler: async (ctx, args) => {
    const user = await requireStaff(ctx);

    const request = await ctx.db.get(args.requestId);
    if (!request) {
      throw new Error("REQUEST_NOT_FOUND: Service request not found.");
    }

    if (request.status !== "OPEN") {
      throw new Error(
        `INVALID_STATE_TRANSITION: Cannot acknowledge request in "${request.status}" status.`
      );
    }

    const now = Date.now();
    await ctx.db.patch(args.requestId, {
      status: "ACKNOWLEDGED",
      acknowledgedAt: now,
      acknowledgedByUserId: user._id,
      updatedAt: now,
    });

    return { success: true, requestId: args.requestId, status: "ACKNOWLEDGED", updatedAt: now };
  },
});

/**
 * Staff mutation to resolve an assistance request.
 * Guarded strictly by requireStaff.
 */
export const resolveServiceRequest = mutation({
  args: {
    requestId: v.id("serviceRequests"),
  },
  handler: async (ctx, args) => {
    const user = await requireStaff(ctx);

    const request = await ctx.db.get(args.requestId);
    if (!request) {
      throw new Error("REQUEST_NOT_FOUND: Service request not found.");
    }

    if (request.status === "RESOLVED" || request.status === "CANCELLED") {
      throw new Error(
        `INVALID_STATE_TRANSITION: Service request is already closed (${request.status}).`
      );
    }

    const now = Date.now();
    await ctx.db.patch(args.requestId, {
      status: "RESOLVED",
      resolvedAt: now,
      resolvedByUserId: user._id,
      updatedAt: now,
    });

    return { success: true, requestId: args.requestId, status: "RESOLVED", updatedAt: now };
  },
});

/**
 * Staff mutation to cancel a service request.
 * Guarded strictly by requireStaff.
 */
export const cancelServiceRequest = mutation({
  args: {
    requestId: v.id("serviceRequests"),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx);

    const request = await ctx.db.get(args.requestId);
    if (!request) {
      throw new Error("REQUEST_NOT_FOUND: Service request not found.");
    }

    const now = Date.now();
    await ctx.db.patch(args.requestId, {
      status: "CANCELLED",
      updatedAt: now,
    });

    return { success: true, requestId: args.requestId, status: "CANCELLED", updatedAt: now };
  },
});

