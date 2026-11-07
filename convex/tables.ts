import { query, mutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin, requireStaff } from "./auth_helpers";

/**
 * Public query for diner table lookup.
 * Returns non-sensitive display information for a table by slug.
 * EXPLICITLY REDACTS qrTokenHash and legacySupabaseId.
 */
export const getTableBySlug = query({
  args: {
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    const table = await ctx.db
      .query("tables")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    if (!table) {
      throw new Error("TABLE_NOT_FOUND: Dining table not found.");
    }

    return {
      _id: table._id,
      tableNumber: table.tableNumber,
      displayName: table.displayName,
      slug: table.slug,
      isActive: table.isActive,
    };
  },
});

/**
 * Staff-only query for dining floor management.
 * Returns all dining tables sorted by table number.
 * Guarded by requireStaff (kitchen_staff or admin).
 */
export const listTables = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);

    const tables = await ctx.db.query("tables").collect();
    return tables
      .sort((a, b) => a.tableNumber - b.tableNumber)
      .map((t) => ({
        _id: t._id,
        tableNumber: t.tableNumber,
        displayName: t.displayName,
        slug: t.slug,
        isActive: t.isActive,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      }));
  },
});

/**
 * Internal query to look up a table by its QR stand secret hash.
 * Used internally during QR scan resolution.
 */
export const internalGetTableByHash = internalQuery({
  args: {
    qrTokenHash: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tables")
      .withIndex("by_qr_hash", (q) => q.eq("qrTokenHash", args.qrTokenHash))
      .first();
  },
});

/**
 * Administrator mutation to regenerate a physical stand QR token hash.
 * Guarded strictly by requireAdmin.
 */
export const adminRegenerateTableQrToken = mutation({
  args: {
    tableId: v.id("tables"),
    newQrTokenHash: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    if (!/^[a-f0-9]{64}$/i.test(args.newQrTokenHash)) {
      throw new Error("INVALID_HASH: QR token hash must be a 64-character hexadecimal SHA-256 digest.");
    }

    const table = await ctx.db.get(args.tableId);
    if (!table) {
      throw new Error("TABLE_NOT_FOUND: Specified table does not exist.");
    }

    const now = Date.now();
    await ctx.db.patch(args.tableId, {
      qrTokenHash: args.newQrTokenHash.toLowerCase(),
      updatedAt: now,
    });

    return { success: true, tableId: args.tableId, updatedAt: now };
  },
});

/**
 * Administrator mutation to toggle physical table operational status.
 * Guarded strictly by requireAdmin.
 */
export const adminToggleTableActive = mutation({
  args: {
    tableId: v.id("tables"),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const table = await ctx.db.get(args.tableId);
    if (!table) {
      throw new Error("TABLE_NOT_FOUND: Specified table does not exist.");
    }

    const now = Date.now();
    await ctx.db.patch(args.tableId, {
      isActive: args.isActive,
      updatedAt: now,
    });

    return { success: true, tableId: args.tableId, isActive: args.isActive, updatedAt: now };
  },
});

