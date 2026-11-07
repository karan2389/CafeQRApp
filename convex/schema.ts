import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  // Built-in tables for @convex-dev/auth (sessions, accounts, refresh tokens, verifiers, rate limits)
  ...authTables,

  // 1. Staff and Admin User Accounts (Role-based access control)
  // Extends authTables.users with Courista roles and single-cafe access controls
  users: defineTable({
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    image: v.optional(v.string()),
    emailVerificationTime: v.optional(v.float64()),
    phoneVerificationTime: v.optional(v.float64()),
    isAnonymous: v.optional(v.boolean()),
    // Single-Cafe Staff Roles: "admin" (full access) or "kitchen_staff" (kitchen operations)
    role: v.optional(v.union(v.literal("admin"), v.literal("kitchen_staff"))),
    isActive: v.optional(v.boolean()),
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
    legacySupabaseId: v.optional(v.string()),
  })
    .index("email", ["email"])
    .index("phone", ["phone"])
    .index("by_role", ["role", "isActive"])
    .index("by_legacy_id", ["legacySupabaseId"]),

  // 2. Singleton Cafe Branding & Operational Settings
  cafeSettings: defineTable({
    name: v.string(), // "Ember & Oak"
    slug: v.string(), // "ember-oak"
    currency: v.string(), // "INR"
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
    openingHours: v.optional(v.string()),
    maintenanceMode: v.boolean(),
    updatedAt: v.number(),
    legacySupabaseId: v.optional(v.string()),
  }).index("by_legacy_id", ["legacySupabaseId"]),

  // 3. Physical Dining Tables (6 physical tables)
  tables: defineTable({
    tableNumber: v.number(), // 1, 2, 3, 4, 5, 6
    displayName: v.string(), // "Table 1"
    slug: v.string(), // "table-1"
    isActive: v.boolean(),
    qrTokenHash: v.string(), // SHA-256 hash of the physical QR stand secret
    createdAt: v.number(),
    updatedAt: v.number(),
    legacySupabaseId: v.optional(v.string()),
  })
    .index("by_table_number", ["tableNumber"])
    .index("by_slug", ["slug"])
    .index("by_qr_hash", ["qrTokenHash"])
    .index("by_legacy_id", ["legacySupabaseId"]),

  // 4. Physical Dining Table Order Sessions (One active session per table bill)
  tableOrderSessions: defineTable({
    tableId: v.id("tables"),
    tableNumber: v.number(),
    status: v.union(v.literal("ACTIVE"), v.literal("PAYMENT_PENDING"), v.literal("CLOSED")),
    openedAt: v.number(),
    closedAt: v.optional(v.number()),
    closedByUserId: v.optional(v.id("users")),
    paymentConfirmedAt: v.optional(v.number()),
    paymentConfirmedByUserId: v.optional(v.id("users")),
    paymentMethod: v.optional(v.union(v.literal("CASH"), v.literal("CARD"), v.literal("UPI"), v.literal("OTHER"))),
    paymentReference: v.optional(v.string()),
    finalBillAmountPaise: v.optional(v.number()), // Stored in integer paise (e.g. ₹850.00 = 85000)
    legacySupabaseId: v.optional(v.string()),
  })
    .index("by_table_and_status", ["tableId", "status"])
    .index("by_status", ["status"])
    .index("by_legacy_id", ["legacySupabaseId"]),

  // 5. Customer Device Scan Sessions (Hardened two-tier session model)
  customerScanSessions: defineTable({
    tableId: v.id("tables"),
    tableOrderSessionId: v.id("tableOrderSessions"),
    customerTokenHash: v.string(), // SHA-256 hash of raw write token in HttpOnly cookie
    readCapabilityTokenHash: v.string(), // SHA-256 hash of the client read-capability token (NEVER raw token)
    createdAt: v.number(),
    expiresAt: v.number(), // 12-hour sliding expiration window
    isActive: v.boolean(),
    revokedAt: v.optional(v.number()),
    legacySupabaseId: v.optional(v.string()),
  })
    .index("by_customer_token_hash", ["customerTokenHash"])
    .index("by_read_capability_hash", ["readCapabilityTokenHash"])
    .index("by_table_session", ["tableOrderSessionId", "isActive"])
    .index("by_legacy_id", ["legacySupabaseId"]),

  // 6. Menu Categories (6 categories)
  menuCategories: defineTable({
    name: v.string(),
    slug: v.string(),
    displayOrder: v.number(),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
    legacySupabaseId: v.optional(v.string()),
  })
    .index("by_sort_order", ["displayOrder"])
    .index("by_slug", ["slug"])
    .index("by_legacy_id", ["legacySupabaseId"]),

  // 7. Menu Items (10 items)
  menuItems: defineTable({
    categoryId: v.id("menuCategories"),
    name: v.string(),
    description: v.optional(v.string()),
    pricePaise: v.number(), // Stored in integer paise (e.g. ₹350.00 = 35000)
    imageUrl: v.optional(v.string()), // Cloudflare R2 public URL
    isAvailable: v.boolean(),
    requiresAgeConfirmation: v.boolean(),
    displayOrder: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    legacySupabaseId: v.optional(v.string()),
  })
    .index("by_category", ["categoryId", "isAvailable"])
    .index("by_display_order", ["displayOrder"])
    .index("by_legacy_id", ["legacySupabaseId"]),

  // 8. Orders (Kitchen tickets)
  orders: defineTable({
    orderNumber: v.string(), // Human-readable ticket number (e.g. "#1024")
    tableOrderSessionId: v.id("tableOrderSessions"),
    tableId: v.id("tables"),
    tableNumber: v.number(),
    customerScanSessionId: v.optional(v.id("customerScanSessions")),
    customerName: v.optional(v.string()),
    orderNotes: v.optional(v.string()),
    status: v.union(
      v.literal("PENDING"),
      v.literal("NEW"),
      v.literal("PREPARING"),
      v.literal("DELIVERED"),
      v.literal("PAID"),
      v.literal("CANCELLED")
    ),
    totalAmountPaise: v.number(), // Stored in integer paise
    cancellationReason: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()), // Unique submission token for customer duplicate prevention
    placedAt: v.number(),
    statusUpdatedAt: v.number(),
    legacySupabaseId: v.optional(v.string()),
  })
    .index("by_table_session", ["tableOrderSessionId"])
    .index("by_status_and_time", ["status", "placedAt"])
    .index("by_table", ["tableId", "placedAt"])
    .index("by_idempotency_key", ["idempotencyKey"])
    .index("by_legacy_id", ["legacySupabaseId"]),

  // 9. Order Line Item Snapshots (Immutable financial records)
  orderItems: defineTable({
    orderId: v.id("orders"),
    menuItemId: v.optional(v.id("menuItems")), // Optional reference in case menu item is archived/deleted
    itemName: v.string(), // Immutable snapshot at time of order
    unitPricePaise: v.number(), // Immutable snapshot in integer paise
    quantity: v.number(), // Positive integer >= 1
    itemTotalPaise: v.number(), // unitPricePaise * quantity in integer paise
    customizationNotes: v.optional(v.string()),
    createdAt: v.number(),
    legacySupabaseId: v.optional(v.string()),
  })
    .index("by_order", ["orderId"])
    .index("by_legacy_id", ["legacySupabaseId"]),

  // 10. Service Requests (Waiter calls and assistance)
  serviceRequests: defineTable({
    tableId: v.id("tables"),
    tableOrderSessionId: v.id("tableOrderSessions"),
    customerScanSessionId: v.optional(v.id("customerScanSessions")),
    tableNumber: v.number(),
    requestType: v.union(
      v.literal("CALL_STAFF"),
      v.literal("REQUEST_WATER"),
      v.literal("REQUEST_BILL"),
      v.literal("REQUEST_ASSISTANCE")
    ),
    note: v.optional(v.string()),
    status: v.union(
      v.literal("OPEN"),
      v.literal("ACKNOWLEDGED"),
      v.literal("RESOLVED"),
      v.literal("CANCELLED")
    ),
    createdAt: v.number(),
    acknowledgedAt: v.optional(v.number()),
    acknowledgedByUserId: v.optional(v.id("users")),
    resolvedAt: v.optional(v.number()),
    resolvedByUserId: v.optional(v.id("users")),
    updatedAt: v.number(),
    legacySupabaseId: v.optional(v.string()),
  })
    .index("by_table_session", ["tableOrderSessionId", "status"])
    .index("by_status_and_time", ["status", "createdAt"])
    .index("by_table", ["tableId", "status"])
    .index("by_legacy_id", ["legacySupabaseId"]),
});
