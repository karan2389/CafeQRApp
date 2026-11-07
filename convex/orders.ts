import { query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import {
  validateCustomerWriteSession,
  validateCustomerReadCapability,
  sha256Hex,
} from "./auth_helpers";

/**
 * Internal mutation for atomic customer order placement.
 * Invoked strictly via the trusted Next.js server HTTP Action (POST /server/orders/submit).
 *
 * Security & Financial Guarantees:
 * 1. Validates customer write session via SHA-256 hash of HttpOnly cookie token.
 * 2. Asserts linked table order session is ACTIVE (rejects closed sessions).
 * 3. Enforces idempotency via idempotencyKey and rapid-submission debounce.
 * 4. Authoritative Pricing: Item prices and availability are read directly from the DB.
 * 5. Integer-Paise Precision: All calculations are strictly in positive integer paise.
 * 6. Immutable Line Item Snapshots: Clones item name and unit price at time of order.
 * 7. Multi-device Support: Multiple diners at the same table order concurrently.
 */
export const submitCustomerOrderInternal = internalMutation({
  args: {
    rawCustomerWriteToken: v.string(),
    items: v.array(
      v.object({
        menuItemId: v.id("menuItems"),
        quantity: v.number(),
        customizationNotes: v.optional(v.string()),
      })
    ),
    customerName: v.optional(v.string()),
    orderNotes: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
    clientClaimedTotalPaise: v.optional(v.number()),
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
      throw new Error("SESSION_CLOSED: Table dining session is closed. New orders cannot be placed.");
    }

    const now = Date.now();

    // 3. Idempotency Key validation (duplicate submission protection)
    if (args.idempotencyKey && args.idempotencyKey.trim().length > 0) {
      const existingOrder = await ctx.db
        .query("orders")
        .withIndex("by_idempotency_key", (q) =>
          q.eq("idempotencyKey", args.idempotencyKey!.trim())
        )
        .first();

      if (existingOrder) {
        // Return existing order without re-creating items
        return {
          success: true,
          orderId: existingOrder._id,
          orderNumber: existingOrder.orderNumber,
          totalAmountPaise: existingOrder.totalAmountPaise,
          status: existingOrder.status,
          placedAt: existingOrder.placedAt,
          isDuplicateReplay: true,
        };
      }
    }

    // 4. Duplicate submission debounce guard (5-second window from same scan session)
    const recentOrders = await ctx.db
      .query("orders")
      .withIndex("by_table_session", (q) =>
        q.eq("tableOrderSessionId", tableOrderSession._id)
      )
      .order("desc")
      .take(5);

    const isDuplicateRecent = recentOrders.some((ro) => {
      if (ro.customerScanSessionId !== scanSession._id) return false;
      const ageMs = now - ro.placedAt;
      return ageMs >= 0 && ageMs < 4000;
    });

    if (isDuplicateRecent && !args.idempotencyKey) {
      throw new Error(
        "DUPLICATE_SUBMISSION: A recent order was just placed. Please wait a few seconds before submitting again."
      );
    }

    // 5. Payload validation
    if (!args.items || args.items.length === 0) {
      throw new Error("EMPTY_ORDER: At least one menu item is required.");
    }

    if (args.items.length > 50) {
      throw new Error("ORDER_TOO_LARGE: Orders cannot contain more than 50 distinct items.");
    }

    // 6. Server-side authoritative price calculation & availability check
    let calculatedTotalPaise = 0;
    const itemSnapshots: Array<{
      menuItemId: (typeof args.items)[0]["menuItemId"];
      itemName: string;
      unitPricePaise: number;
      quantity: number;
      itemTotalPaise: number;
      customizationNotes?: string;
    }> = [];

    for (const item of args.items) {
      if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) {
        throw new Error(
          `INVALID_QUANTITY: Item quantity must be a positive integer between 1 and 99.`
        );
      }

      const menuItem = await ctx.db.get(item.menuItemId);
      if (!menuItem) {
        throw new Error(`ITEM_NOT_FOUND: Menu item ${item.menuItemId} does not exist or was deleted.`);
      }

      if (!menuItem.isAvailable) {
        throw new Error(`ITEM_UNAVAILABLE: Menu item "${menuItem.name}" is currently sold out.`);
      }

      if (!Number.isInteger(menuItem.pricePaise) || menuItem.pricePaise <= 0) {
        throw new Error(`INVALID_ITEM_PRICE: Menu item "${menuItem.name}" has an invalid price.`);
      }

      const lineTotalPaise = menuItem.pricePaise * item.quantity;
      calculatedTotalPaise += lineTotalPaise;

      itemSnapshots.push({
        menuItemId: item.menuItemId,
        itemName: menuItem.name,
        unitPricePaise: menuItem.pricePaise,
        quantity: item.quantity,
        itemTotalPaise: lineTotalPaise,
        customizationNotes: item.customizationNotes?.trim() || undefined,
      });
    }

    // 7. Detect price manipulation attempts
    if (
      args.clientClaimedTotalPaise !== undefined &&
      args.clientClaimedTotalPaise !== calculatedTotalPaise
    ) {
      throw new Error(
        `PRICE_MANIPULATION_DETECTED: Client claimed total (₹${args.clientClaimedTotalPaise / 100}) does not match authoritative catalog price (₹${calculatedTotalPaise / 100}).`
      );
    }

    // 8. Generate ticket sequence number
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const orderNumber = `#T${tableOrderSession.tableNumber}-${randomSuffix}`;

    // 9. Insert order ticket
    const orderId = await ctx.db.insert("orders", {
      orderNumber,
      tableOrderSessionId: tableOrderSession._id,
      tableId: tableOrderSession.tableId,
      tableNumber: tableOrderSession.tableNumber,
      customerScanSessionId: scanSession._id,
      customerName: args.customerName?.trim() || undefined,
      orderNotes: args.orderNotes?.trim() || undefined,
      status: "NEW",
      totalAmountPaise: calculatedTotalPaise,
      idempotencyKey: args.idempotencyKey?.trim() || undefined,
      placedAt: now,
      statusUpdatedAt: now,
    });

    // 10. Insert immutable order items
    for (const snap of itemSnapshots) {
      await ctx.db.insert("orderItems", {
        orderId,
        menuItemId: snap.menuItemId,
        itemName: snap.itemName,
        unitPricePaise: snap.unitPricePaise,
        quantity: snap.quantity,
        itemTotalPaise: snap.itemTotalPaise,
        customizationNotes: snap.customizationNotes,
        createdAt: now,
      });
    }

    return {
      success: true,
      orderId,
      orderNumber,
      totalAmountPaise: calculatedTotalPaise,
      status: "NEW",
      itemCount: itemSnapshots.length,
      placedAt: now,
      isDuplicateReplay: false,
    };
  },
});

/**
 * Public reactive query for customer order tracking.
 * Strictly guarded by validateCustomerReadCapability.
 *
 * Security & Privacy:
 * 1. Validates capability token; derives table session internally.
 * 2. Cross-table isolation: Caller cannot specify target table ID.
 * 3. Sanitized payload: Excludes internal database hashes, staff notes, and server secrets.
 */
export const getCustomerTableOrders = query({
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

    // Query all orders placed for this dining table session
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_table_session", (q) =>
        q.eq("tableOrderSessionId", tableOrderSession._id)
      )
      .order("desc")
      .collect();

    let totalTableAmountPaise = 0;
    const sanitizedOrders = [];

    for (const order of orders) {
      if (order.status !== "CANCELLED") {
        totalTableAmountPaise += order.totalAmountPaise;
      }

      const items = await ctx.db
        .query("orderItems")
        .withIndex("by_order", (q) => q.eq("orderId", order._id))
        .collect();

      sanitizedOrders.push({
        _id: order._id,
        orderNumber: order.orderNumber,
        status: order.status,
        totalAmountPaise: order.totalAmountPaise,
        placedAt: order.placedAt,
        statusUpdatedAt: order.statusUpdatedAt,
        customerName: order.customerName,
        orderNotes: order.orderNotes,
        cancellationReason: order.cancellationReason,
        isCurrentDevice: order.customerScanSessionId === scanSession._id,
        items: items.map((i) => ({
          _id: i._id,
          itemName: i.itemName,
          unitPricePaise: i.unitPricePaise,
          quantity: i.quantity,
          itemTotalPaise: i.itemTotalPaise,
          customizationNotes: i.customizationNotes,
        })),
      });
    }

    return {
      tableNumber: tableOrderSession.tableNumber,
      sessionStatus: tableOrderSession.status,
      orders: sanitizedOrders,
      totalTableAmountPaise,
    };
  },
});

/**
 * Public query for a single order's real-time detail.
 * Cross-table protected: Rejects requests for orders from other tables.
 */
export const getCustomerOrderById = query({
  args: {
    customerScanSessionId: v.id("customerScanSessions"),
    rawReadCapabilityToken: v.string(),
    orderId: v.id("orders"),
  },
  handler: async (ctx, args) => {
    const { scanSession, tableOrderSession } = await validateCustomerReadCapability(
      ctx,
      args.customerScanSessionId,
      args.rawReadCapabilityToken
    );

    const order = await ctx.db.get(args.orderId);
    if (!order || order.tableOrderSessionId !== tableOrderSession._id) {
      throw new Error("UNAUTHORIZED: Order not found or does not belong to your table session.");
    }

    const items = await ctx.db
      .query("orderItems")
      .withIndex("by_order", (q) => q.eq("orderId", order._id))
      .collect();

    return {
      _id: order._id,
      orderNumber: order.orderNumber,
      status: order.status,
      totalAmountPaise: order.totalAmountPaise,
      placedAt: order.placedAt,
      statusUpdatedAt: order.statusUpdatedAt,
      customerName: order.customerName,
      orderNotes: order.orderNotes,
      cancellationReason: order.cancellationReason,
      isCurrentDevice: order.customerScanSessionId === scanSession._id,
      items: items.map((i) => ({
        _id: i._id,
        itemName: i.itemName,
        unitPricePaise: i.unitPricePaise,
        quantity: i.quantity,
        itemTotalPaise: i.itemTotalPaise,
        customizationNotes: i.customizationNotes,
      })),
    };
  },
});

