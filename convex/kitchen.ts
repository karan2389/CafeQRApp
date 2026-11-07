import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { requireStaff } from "./auth_helpers";

const OPERATIONAL_DELIVERED_WINDOW_MS = 2 * 60 * 60 * 1000; // Recent delivered window: 2 hours

interface OrderItemDetail {
  _id: Id<"orderItems">;
  itemName: string;
  unitPricePaise: number;
  quantity: number;
  itemTotalPaise: number;
  customizationNotes?: string;
}

interface KitchenOrderDetail {
  _id: Id<"orders">;
  orderNumber: string;
  tableNumber: number;
  tableId: Id<"tables">;
  tableOrderSessionId: Id<"tableOrderSessions">;
  customerName?: string;
  orderNotes?: string;
  status: "PENDING" | "NEW" | "PREPARING" | "DELIVERED" | "PAID" | "CANCELLED";
  totalAmountPaise: number;
  placedAt: number;
  statusUpdatedAt: number;
  elapsedSeconds: number;
  cancellationReason?: string;
  items: OrderItemDetail[];
}

/**
 * Staff-only reactive query to retrieve the active kitchen order queue.
 * Guarded strictly by requireStaff (kitchen staff and admin).
 *
 * Operational Organization:
 * 1. Fetches NEW and PREPARING orders in real time.
 * 2. Fetches recent DELIVERED orders within the 2-hour operational window.
 * 3. Populates immutable order item snapshots with quantities and custom notes.
 * 4. Groups active orders by dining table for rapid line-cook reference.
 * 5. Provides high-level operational metrics.
 */
export const getActiveKitchenQueue = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);

    const now = Date.now();
    const deliveredThreshold = now - OPERATIONAL_DELIVERED_WINDOW_MS;

    // 1. Fetch NEW orders (Chronological: oldest first to prioritize wait time)
    const newOrdersRaw = await ctx.db
      .query("orders")
      .withIndex("by_status_and_time", (q) => q.eq("status", "NEW"))
      .order("asc")
      .collect();

    // 2. Fetch PREPARING orders (Oldest first)
    const preparingOrdersRaw = await ctx.db
      .query("orders")
      .withIndex("by_status_and_time", (q) => q.eq("status", "PREPARING"))
      .order("asc")
      .collect();

    // 3. Fetch recent DELIVERED orders (Most recent first)
    const deliveredOrdersRaw = await ctx.db
      .query("orders")
      .withIndex("by_status_and_time", (q) => q.eq("status", "DELIVERED"))
      .order("desc")
      .filter((q) => q.gte(q.field("placedAt"), deliveredThreshold))
      .take(50);

    // Helper to populate line items for an order
    const populateOrder = async (order: typeof newOrdersRaw[0]): Promise<KitchenOrderDetail> => {
      const items = await ctx.db
        .query("orderItems")
        .withIndex("by_order", (q) => q.eq("orderId", order._id))
        .collect();

      return {
        _id: order._id,
        orderNumber: order.orderNumber,
        tableNumber: order.tableNumber,
        tableId: order.tableId,
        tableOrderSessionId: order.tableOrderSessionId,
        customerName: order.customerName,
        orderNotes: order.orderNotes,
        status: order.status,
        totalAmountPaise: order.totalAmountPaise,
        placedAt: order.placedAt,
        statusUpdatedAt: order.statusUpdatedAt,
        elapsedSeconds: Math.max(0, Math.floor((now - order.placedAt) / 1000)),
        cancellationReason: order.cancellationReason,
        items: items.map((i) => ({
          _id: i._id,
          itemName: i.itemName,
          unitPricePaise: i.unitPricePaise,
          quantity: i.quantity,
          itemTotalPaise: i.itemTotalPaise,
          customizationNotes: i.customizationNotes,
        })),
      };
    };

    const [newOrders, preparingOrders, recentDeliveredOrders] = await Promise.all([
      Promise.all(newOrdersRaw.map(populateOrder)),
      Promise.all(preparingOrdersRaw.map(populateOrder)),
      Promise.all(deliveredOrdersRaw.map(populateOrder)),
    ]);

    // Group active (NEW + PREPARING) orders by table number
    const activeOrders = [...newOrders, ...preparingOrders];
    const tableMap = new Map<number, { tableId: Id<"tables">; orders: KitchenOrderDetail[] }>();

    for (const order of activeOrders) {
      const existing = tableMap.get(order.tableNumber);
      if (existing) {
        existing.orders.push(order);
      } else {
        tableMap.set(order.tableNumber, {
          tableId: order.tableId,
          orders: [order],
        });
      }
    }

    const ordersByTable = Array.from(tableMap.entries())
      .map(([tableNumber, { tableId, orders }]) => ({
        tableNumber,
        tableId,
        orders,
      }))
      .sort((a, b) => a.tableNumber - b.tableNumber);

    return {
      newOrders,
      preparingOrders,
      recentDeliveredOrders,
      ordersByTable,
      metrics: {
        newOrdersCount: newOrders.length,
        preparingOrdersCount: preparingOrders.length,
        activeOrdersCount: activeOrders.length,
        deliveredOrdersCount: recentDeliveredOrders.length,
      },
    };
  },
});

/**
 * Staff-only mutation to advance order preparation lifecycle.
 * Guarded strictly by requireStaff.
 *
 * State Machine Transition Rules:
 * - NEW → PREPARING
 * - PREPARING → DELIVERED
 * - NEW / PREPARING → CANCELLED (with optional reason)
 *
 * Invariants:
 * 1. Reject invalid status transitions (e.g., DELIVERED → PREPARING, NEW → DELIVERED).
 * 2. Reject transitions on non-existent orders.
 * 3. Reject duplicate status update (order already in target status).
 * 4. Keep PAID completely separate (settlement belongs strictly to Phase 3.4).
 */
export const updateOrderStatus = mutation({
  args: {
    orderId: v.id("orders"),
    targetStatus: v.union(
      v.literal("PREPARING"),
      v.literal("DELIVERED"),
      v.literal("CANCELLED")
    ),
    cancellationReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx);

    const order = await ctx.db.get(args.orderId);
    if (!order) {
      throw new Error("ORDER_NOT_FOUND: Order does not exist.");
    }

    // Duplicate status transition check
    if (order.status === args.targetStatus) {
      throw new Error(
        `NO_STATUS_CHANGE: Order ${order.orderNumber} is already in "${args.targetStatus}" status.`
      );
    }

    // Strict transition state machine
    const validTransitions: Record<string, string[]> = {
      NEW: ["PREPARING", "CANCELLED"],
      PREPARING: ["DELIVERED", "CANCELLED"],
      DELIVERED: [], // Terminal for kitchen workflow
      CANCELLED: [], // Terminal
      PAID: [], // Settlement phase only
      PENDING: ["NEW", "CANCELLED"],
    };

    const allowed = validTransitions[order.status] || [];
    if (!allowed.includes(args.targetStatus)) {
      throw new Error(
        `INVALID_STATUS_TRANSITION: Cannot transition order from "${order.status}" to "${args.targetStatus}".`
      );
    }

    const now = Date.now();
    await ctx.db.patch(args.orderId, {
      status: args.targetStatus,
      statusUpdatedAt: now,
      cancellationReason:
        args.targetStatus === "CANCELLED"
          ? args.cancellationReason?.trim() || "Cancelled by kitchen staff"
          : order.cancellationReason,
    });

    return {
      success: true,
      orderId: args.orderId,
      orderNumber: order.orderNumber,
      previousStatus: order.status,
      newStatus: args.targetStatus,
      statusUpdatedAt: now,
    };
  },
});

/**
 * Staff-only reactive query to monitor high-level kitchen operational metrics.
 * Guarded strictly by requireStaff.
 */
export const getKitchenMetrics = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);

    const now = Date.now();
    const twoHoursAgo = now - OPERATIONAL_DELIVERED_WINDOW_MS;

    const newOrders = await ctx.db
      .query("orders")
      .withIndex("by_status_and_time", (q) => q.eq("status", "NEW"))
      .collect();

    const preparingOrders = await ctx.db
      .query("orders")
      .withIndex("by_status_and_time", (q) => q.eq("status", "PREPARING"))
      .collect();

    const deliveredOrders = await ctx.db
      .query("orders")
      .withIndex("by_status_and_time", (q) => q.eq("status", "DELIVERED"))
      .order("desc")
      .filter((q) => q.gte(q.field("placedAt"), twoHoursAgo))
      .collect();

    const activeServiceRequests = await ctx.db
      .query("serviceRequests")
      .withIndex("by_status_and_time", (q) => q.eq("status", "OPEN"))
      .collect();

    const ackServiceRequests = await ctx.db
      .query("serviceRequests")
      .withIndex("by_status_and_time", (q) => q.eq("status", "ACKNOWLEDGED"))
      .collect();

    const activeTableNumbers = new Set([
      ...newOrders.map((o) => o.tableNumber),
      ...preparingOrders.map((o) => o.tableNumber),
    ]);

    return {
      newOrdersCount: newOrders.length,
      preparingOrdersCount: preparingOrders.length,
      activeOrdersCount: newOrders.length + preparingOrders.length,
      deliveredOrdersCount: deliveredOrders.length,
      activeServiceRequestsCount: activeServiceRequests.length + ackServiceRequests.length,
      activeTablesCount: activeTableNumbers.size,
    };
  },
});

