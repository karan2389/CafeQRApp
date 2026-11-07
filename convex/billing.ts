import { query, mutation, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { Id, Doc } from "./_generated/dataModel";
import { requireStaff, validateCustomerReadCapability } from "./auth_helpers";

interface BillLineItem {
  _id: Id<"orderItems">;
  itemName: string;
  unitPricePaise: number;
  quantity: number;
  itemTotalPaise: number;
  customizationNotes?: string;
}

interface BillOrderSummary {
  _id: Id<"orders">;
  orderNumber: string;
  status: "PENDING" | "NEW" | "PREPARING" | "DELIVERED" | "PAID" | "CANCELLED";
  totalAmountPaise: number;
  placedAt: number;
  statusUpdatedAt: number;
  customerName?: string;
  orderNotes?: string;
  cancellationReason?: string;
  items: BillLineItem[];
}

/**
 * Helper to fetch and organize all orders and line items for a table session.
 */
async function computeSessionBill(
  ctx: QueryCtx | MutationCtx,
  tableOrderSessionId: Id<"tableOrderSessions">
) {
  const orders = await ctx.db
    .query("orders")
    .withIndex("by_table_session", (q) =>
      q.eq("tableOrderSessionId", tableOrderSessionId)
    )
    .order("asc")
    .collect();

  const deliveredOrders: BillOrderSummary[] = [];
  const unfinishedOrders: BillOrderSummary[] = [];
  const cancelledOrders: BillOrderSummary[] = [];

  let payableAmountPaise = 0;
  let pendingAmountPaise = 0;
  let cancelledAmountPaise = 0;

  for (const order of orders) {
    const items = await ctx.db
      .query("orderItems")
      .withIndex("by_order", (q) => q.eq("orderId", order._id))
      .collect();

    const orderSummary: BillOrderSummary = {
      _id: order._id,
      orderNumber: order.orderNumber,
      status: order.status,
      totalAmountPaise: order.totalAmountPaise,
      placedAt: order.placedAt,
      statusUpdatedAt: order.statusUpdatedAt,
      customerName: order.customerName,
      orderNotes: order.orderNotes,
      cancellationReason: order.cancellationReason,
      items: items.map((i: Doc<"orderItems">) => ({
        _id: i._id,
        itemName: i.itemName,
        unitPricePaise: i.unitPricePaise,
        quantity: i.quantity,
        itemTotalPaise: i.itemTotalPaise,
        customizationNotes: i.customizationNotes,
      })),
    };

    if (order.status === "DELIVERED" || order.status === "PAID") {
      deliveredOrders.push(orderSummary);
      payableAmountPaise += order.totalAmountPaise;
    } else if (order.status === "CANCELLED") {
      cancelledOrders.push(orderSummary);
      cancelledAmountPaise += order.totalAmountPaise;
    } else {
      // NEW, PREPARING, PENDING
      unfinishedOrders.push(orderSummary);
      pendingAmountPaise += order.totalAmountPaise;
    }
  }

  return {
    deliveredOrders,
    unfinishedOrders,
    cancelledOrders,
    payableAmountPaise,
    pendingAmountPaise,
    cancelledAmountPaise,
    totalOrderedAmountPaise: payableAmountPaise + pendingAmountPaise,
    isReadyForClosure: unfinishedOrders.length === 0,
    unfinishedOrderCount: unfinishedOrders.length,
  };
}

/**
 * Staff-only query to fetch the authoritative running bill for a dining table session.
 * Guarded strictly by requireStaff (kitchen staff and admin).
 *
 * Monetary & Accounting Guarantees:
 * 1. Calculated strictly from immutable orderItems snapshots in positive integer paise.
 * 2. Segregates delivered (payable), unfinished (pending), and cancelled orders.
 * 3. Cancelled orders are excluded from payable total.
 * 4. Flags whether session is eligible for payment settlement (unfinishedOrderCount === 0).
 */
export const getTableSessionBill = query({
  args: {
    tableOrderSessionId: v.id("tableOrderSessions"),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx);

    const session = await ctx.db.get(args.tableOrderSessionId);
    if (!session) {
      throw new Error("SESSION_NOT_FOUND: Table dining session not found.");
    }

    const billBreakdown = await computeSessionBill(ctx, args.tableOrderSessionId);

    return {
      tableOrderSessionId: session._id,
      tableId: session.tableId,
      tableNumber: session.tableNumber,
      sessionStatus: session.status,
      openedAt: session.openedAt,
      closedAt: session.closedAt,
      paymentMethod: session.paymentMethod,
      finalBillAmountPaise: session.finalBillAmountPaise ?? billBreakdown.payableAmountPaise,
      ...billBreakdown,
    };
  },
});

/**
 * Staff-only query to lookup running bill directly by physical table number.
 * Guarded strictly by requireStaff.
 */
export const getActiveTableBillByNumber = query({
  args: {
    tableNumber: v.number(),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx);

    const table = await ctx.db
      .query("tables")
      .withIndex("by_table_number", (q) => q.eq("tableNumber", args.tableNumber))
      .first();

    if (!table) {
      throw new Error(`TABLE_NOT_FOUND: Table ${args.tableNumber} does not exist.`);
    }

    const session = await ctx.db
      .query("tableOrderSessions")
      .withIndex("by_table_and_status", (q) =>
        q.eq("tableId", table._id).eq("status", "ACTIVE")
      )
      .first();

    if (!session) {
      throw new Error(`NO_ACTIVE_SESSION: Table ${args.tableNumber} does not have an active dining session.`);
    }

    const billBreakdown = await computeSessionBill(ctx, session._id);

    return {
      tableOrderSessionId: session._id,
      tableId: table._id,
      tableNumber: table.tableNumber,
      sessionStatus: session.status,
      openedAt: session.openedAt,
      ...billBreakdown,
    };
  },
});

/**
 * Customer-facing reactive query for table running bill tracking.
 * Guarded strictly by validateCustomerReadCapability.
 *
 * Security:
 * 1. Derives table session directly from authenticated read capability token.
 * 2. Cross-table protected: Diners cannot query another table's bill.
 * 3. Sanitized payload: Excludes internal tokens, server secrets, and staff notes.
 */
export const getCustomerTableBill = query({
  args: {
    customerScanSessionId: v.id("customerScanSessions"),
    rawReadCapabilityToken: v.string(),
  },
  handler: async (ctx, args) => {
    const { tableOrderSession } = await validateCustomerReadCapability(
      ctx,
      args.customerScanSessionId,
      args.rawReadCapabilityToken
    );

    const billBreakdown = await computeSessionBill(ctx, tableOrderSession._id);

    return {
      tableNumber: tableOrderSession.tableNumber,
      sessionStatus: tableOrderSession.status,
      openedAt: tableOrderSession.openedAt,
      closedAt: tableOrderSession.closedAt,
      paymentMethod: tableOrderSession.paymentMethod,
      finalBillAmountPaise: tableOrderSession.finalBillAmountPaise ?? billBreakdown.payableAmountPaise,
      ...billBreakdown,
    };
  },
});

/**
 * Staff-only mutation for atomic payment settlement and table session closure.
 * Guarded strictly by requireStaff. Customers cannot settle or close bills.
 *
 * Atomic Execution Steps:
 * 1. Validates active table session (rejects if already CLOSED).
 * 2. Unfinished Order Protection: Blocks closure if any orders are NEW, PREPARING, or PENDING.
 * 3. Authoritative Pricing: Recalculates total payable amount from delivered order lines.
 * 4. Transitions delivered orders to PAID status.
 * 5. Resolves any remaining OPEN or ACKNOWLEDGED service requests.
 * 6. Revokes all active customer scan sessions for this dining table session.
 * 7. Marks table session as CLOSED with payment method, staff ID, and timestamp.
 * 8. Subsequent customer scans will atomically create a new active dining session.
 */
export const settleAndCloseTableSession = mutation({
  args: {
    tableOrderSessionId: v.id("tableOrderSessions"),
    paymentMethod: v.union(
      v.literal("CASH"),
      v.literal("UPI"),
      v.literal("CARD"),
      v.literal("OTHER")
    ),
    paymentReference: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // 1. Authenticate staff role
    const staff = await requireStaff(ctx);

    // 2. Fetch and validate table session
    const session = await ctx.db.get(args.tableOrderSessionId);
    if (!session) {
      throw new Error("SESSION_NOT_FOUND: Table dining session not found.");
    }

    if (session.status === "CLOSED") {
      throw new Error("SESSION_ALREADY_CLOSED: Table dining session is already settled and closed.");
    }

    const now = Date.now();

    // 3. Fetch all orders for this table session
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_table_session", (q) =>
        q.eq("tableOrderSessionId", args.tableOrderSessionId)
      )
      .collect();

    // 4. Unfinished orders protection: Block closure if orders are still preparing or new
    const unfinishedOrders = orders.filter(
      (o) => o.status === "NEW" || o.status === "PREPARING" || o.status === "PENDING"
    );

    if (unfinishedOrders.length > 0) {
      throw new Error(
        `UNFINISHED_ORDERS_EXIST: Cannot settle table with ${unfinishedOrders.length} unfinished order(s). Please deliver or cancel pending orders before settling payment.`
      );
    }

    // 5. Authoritative calculation of delivered orders in integer paise
    const deliveredOrders = orders.filter((o) => o.status === "DELIVERED");
    let calculatedTotalPaise = 0;

    for (const order of deliveredOrders) {
      calculatedTotalPaise += order.totalAmountPaise;

      // Transition delivered orders to PAID
      await ctx.db.patch(order._id, {
        status: "PAID",
        statusUpdatedAt: now,
      });
    }

    // 6. Resolve all remaining active service requests for this table session
    const activeServiceRequests = await ctx.db
      .query("serviceRequests")
      .withIndex("by_table_session", (q) =>
        q.eq("tableOrderSessionId", args.tableOrderSessionId)
      )
      .collect();

    for (const req of activeServiceRequests) {
      if (req.status === "OPEN" || req.status === "ACKNOWLEDGED") {
        await ctx.db.patch(req._id, {
          status: "RESOLVED",
          resolvedAt: now,
          resolvedByUserId: staff._id,
          updatedAt: now,
        });
      }
    }

    // 7. Revoke all customer scan sessions bound to this table session
    const customerScanSessions = await ctx.db
      .query("customerScanSessions")
      .withIndex("by_table_session", (q) =>
        q.eq("tableOrderSessionId", args.tableOrderSessionId)
      )
      .collect();

    for (const scan of customerScanSessions) {
      if (scan.isActive) {
        await ctx.db.patch(scan._id, {
          isActive: false,
          revokedAt: now,
        });
      }
    }

    // 8. Seal the table order session as CLOSED
    await ctx.db.patch(args.tableOrderSessionId, {
      status: "CLOSED",
      closedAt: now,
      closedByUserId: staff._id,
      paymentConfirmedAt: now,
      paymentConfirmedByUserId: staff._id,
      paymentMethod: args.paymentMethod,
      paymentReference: args.paymentReference?.trim() || undefined,
      finalBillAmountPaise: calculatedTotalPaise,
    });

    return {
      success: true,
      tableOrderSessionId: args.tableOrderSessionId,
      tableNumber: session.tableNumber,
      finalBillAmountPaise: calculatedTotalPaise,
      paymentMethod: args.paymentMethod,
      paidOrdersCount: deliveredOrders.length,
      closedBy: staff.email,
      closedAt: now,
    };
  },
});
