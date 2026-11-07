import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin } from "./auth_helpers";

/**
 * Public query: Fetch active menu categories.
 * Accessible to unauthenticated diners.
 * Returns only public fields, sorted by displayOrder.
 */
export const getPublicCategories = query({
  args: {},
  handler: async (ctx) => {
    const categories = await ctx.db
      .query("menuCategories")
      .withIndex("by_sort_order")
      .collect();

    return categories
      .filter((c) => c.isActive)
      .map((c) => ({
        _id: c._id,
        name: c.name,
        slug: c.slug,
        displayOrder: c.displayOrder,
      }));
  },
});

/**
 * Admin query: Fetch all menu categories (active and inactive).
 * Guarded strictly by requireAdmin.
 */
export const getAdminCategories = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const categories = await ctx.db
      .query("menuCategories")
      .withIndex("by_sort_order")
      .collect();

    return categories.map((c) => ({
      _id: c._id,
      name: c.name,
      slug: c.slug,
      displayOrder: c.displayOrder,
      isActive: c.isActive,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
  },
});

/**
 * Admin mutation: Create a new menu category.
 * Guarded strictly by requireAdmin.
 */
export const createCategory = mutation({
  args: {
    name: v.string(),
    slug: v.string(),
    displayOrder: v.number(),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const trimmedName = args.name.trim();
    if (trimmedName.length < 2) {
      throw new Error("INVALID_CATEGORY_NAME: Category name must be at least 2 characters.");
    }

    const cleanSlug = args.slug.toLowerCase().trim();
    if (!/^[a-z0-9-]+$/.test(cleanSlug)) {
      throw new Error("INVALID_CATEGORY_SLUG: Slug may only contain lowercase alphanumeric characters and hyphens.");
    }

    const existingSlug = await ctx.db
      .query("menuCategories")
      .withIndex("by_slug", (q) => q.eq("slug", cleanSlug))
      .first();

    if (existingSlug) {
      throw new Error("CATEGORY_SLUG_EXISTS: A category with this slug already exists.");
    }

    const now = Date.now();
    const categoryId = await ctx.db.insert("menuCategories", {
      name: trimmedName,
      slug: cleanSlug,
      displayOrder: args.displayOrder,
      isActive: args.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    });

    return { success: true, categoryId };
  },
});

/**
 * Admin mutation: Update an existing menu category.
 * Guarded strictly by requireAdmin.
 */
export const updateCategory = mutation({
  args: {
    categoryId: v.id("menuCategories"),
    name: v.optional(v.string()),
    slug: v.optional(v.string()),
    displayOrder: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const category = await ctx.db.get(args.categoryId);
    if (!category) {
      throw new Error("CATEGORY_NOT_FOUND: Menu category not found.");
    }

    const updates: Partial<{
      name: string;
      slug: string;
      displayOrder: number;
      isActive: boolean;
      updatedAt: number;
    }> = {
      updatedAt: Date.now(),
    };

    if (args.name !== undefined) {
      const trimmed = args.name.trim();
      if (trimmed.length < 2) {
        throw new Error("INVALID_CATEGORY_NAME: Category name must be at least 2 characters.");
      }
      updates.name = trimmed;
    }

    if (args.slug !== undefined) {
      const cleanSlug = args.slug.toLowerCase().trim();
      if (!/^[a-z0-9-]+$/.test(cleanSlug)) {
        throw new Error("INVALID_CATEGORY_SLUG: Slug may only contain lowercase alphanumeric characters and hyphens.");
      }
      if (cleanSlug !== category.slug) {
        const existing = await ctx.db
          .query("menuCategories")
          .withIndex("by_slug", (q) => q.eq("slug", cleanSlug))
          .first();
        if (existing) {
          throw new Error("CATEGORY_SLUG_EXISTS: A category with this slug already exists.");
        }
      }
      updates.slug = cleanSlug;
    }

    if (args.displayOrder !== undefined) {
      updates.displayOrder = args.displayOrder;
    }

    if (args.isActive !== undefined) {
      updates.isActive = args.isActive;
    }

    await ctx.db.patch(args.categoryId, updates);
    return { success: true, categoryId: args.categoryId };
  },
});

/**
 * Admin mutation: Delete a menu category.
 * Refuses deletion if items belong to this category to maintain referential integrity.
 */
export const deleteCategory = mutation({
  args: {
    categoryId: v.id("menuCategories"),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const category = await ctx.db.get(args.categoryId);
    if (!category) {
      throw new Error("CATEGORY_NOT_FOUND: Menu category not found.");
    }

    const itemsInCategory = await ctx.db
      .query("menuItems")
      .withIndex("by_category", (q) => q.eq("categoryId", args.categoryId))
      .first();

    if (itemsInCategory) {
      throw new Error("CATEGORY_IN_USE: Cannot delete category containing menu items. Reassign or delete items first.");
    }

    await ctx.db.delete(args.categoryId);
    return { success: true, categoryId: args.categoryId };
  },
});

