import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin, requireStaff } from "./auth_helpers";

/**
 * Public query: Diner-facing menu catalog.
 * Accessible anonymously.
 * Returns only active categories containing their currently available items,
 * sorted by displayOrder. Redacts internal timestamps and legacy fields.
 */
export const getPublicMenu = query({
  args: {},
  handler: async (ctx) => {
    // 1. Fetch active categories
    const categories = await ctx.db
      .query("menuCategories")
      .withIndex("by_sort_order")
      .collect();

    const activeCategories = categories.filter((c) => c.isActive);

    // 2. Fetch available items per category
    const menuWithItems = await Promise.all(
      activeCategories.map(async (category) => {
        const items = await ctx.db
          .query("menuItems")
          .withIndex("by_category", (q) =>
            q.eq("categoryId", category._id).eq("isAvailable", true)
          )
          .collect();

        // Sort by displayOrder
        const sortedItems = items
          .sort((a, b) => a.displayOrder - b.displayOrder)
          .map((item) => ({
            _id: item._id,
            categoryId: item.categoryId,
            name: item.name,
            description: item.description,
            pricePaise: item.pricePaise,
            imageUrl: item.imageUrl,
            requiresAgeConfirmation: item.requiresAgeConfirmation,
            displayOrder: item.displayOrder,
          }));

        return {
          _id: category._id,
          name: category.name,
          slug: category.slug,
          displayOrder: category.displayOrder,
          items: sortedItems,
        };
      })
    );

    return menuWithItems;
  },
});

/**
 * Admin query: Complete menu catalog for administration.
 * Guarded strictly by requireAdmin.
 * Returns all items (available, 86'd, archived) with full metadata.
 */
export const getAdminMenuItems = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const items = await ctx.db.query("menuItems").collect();
    const categories = await ctx.db.query("menuCategories").collect();
    const categoryMap = new Map(categories.map((c) => [c._id, c.name]));

    return items
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((item) => ({
        _id: item._id,
        categoryId: item.categoryId,
        categoryName: categoryMap.get(item.categoryId) ?? "Unknown",
        name: item.name,
        description: item.description,
        pricePaise: item.pricePaise,
        imageUrl: item.imageUrl,
        isAvailable: item.isAvailable,
        requiresAgeConfirmation: item.requiresAgeConfirmation,
        displayOrder: item.displayOrder,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      }));
  },
});

/**
 * Admin mutation: Create a new menu item.
 * Guarded strictly by requireAdmin.
 * Enforces integer paise price (> 0), category existence, and valid names.
 */
export const createMenuItem = mutation({
  args: {
    categoryId: v.id("menuCategories"),
    name: v.string(),
    description: v.optional(v.string()),
    pricePaise: v.number(),
    imageUrl: v.optional(v.string()),
    isAvailable: v.optional(v.boolean()),
    requiresAgeConfirmation: v.optional(v.boolean()),
    displayOrder: v.number(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const trimmedName = args.name.trim();
    if (trimmedName.length < 2) {
      throw new Error("INVALID_ITEM_NAME: Menu item name must be at least 2 characters.");
    }

    if (!Number.isInteger(args.pricePaise) || args.pricePaise <= 0) {
      throw new Error("INVALID_PRICE: Price in paise must be a positive integer greater than 0.");
    }

    const category = await ctx.db.get(args.categoryId);
    if (!category) {
      throw new Error("CATEGORY_NOT_FOUND: Assigned menu category does not exist.");
    }

    if (args.imageUrl !== undefined && args.imageUrl !== "") {
      try {
        new URL(args.imageUrl);
      } catch {
        throw new Error("INVALID_IMAGE_URL: Provided image URL is not a valid URL.");
      }
    }

    const now = Date.now();
    const menuItemId = await ctx.db.insert("menuItems", {
      categoryId: args.categoryId,
      name: trimmedName,
      description: args.description?.trim(),
      pricePaise: args.pricePaise,
      imageUrl: args.imageUrl?.trim(),
      isAvailable: args.isAvailable ?? true,
      requiresAgeConfirmation: args.requiresAgeConfirmation ?? false,
      displayOrder: args.displayOrder,
      createdAt: now,
      updatedAt: now,
    });

    return { success: true, menuItemId };
  },
});

/**
 * Admin mutation: Update an existing menu item.
 * Guarded strictly by requireAdmin.
 */
export const updateMenuItem = mutation({
  args: {
    menuItemId: v.id("menuItems"),
    categoryId: v.optional(v.id("menuCategories")),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    pricePaise: v.optional(v.number()),
    imageUrl: v.optional(v.string()),
    isAvailable: v.optional(v.boolean()),
    requiresAgeConfirmation: v.optional(v.boolean()),
    displayOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const item = await ctx.db.get(args.menuItemId);
    if (!item) {
      throw new Error("ITEM_NOT_FOUND: Menu item not found.");
    }

    const updates: Partial<{
      categoryId: typeof args.categoryId;
      name: string;
      description?: string;
      pricePaise: number;
      imageUrl?: string;
      isAvailable: boolean;
      requiresAgeConfirmation: boolean;
      displayOrder: number;
      updatedAt: number;
    }> = {
      updatedAt: Date.now(),
    };

    if (args.name !== undefined) {
      const trimmed = args.name.trim();
      if (trimmed.length < 2) {
        throw new Error("INVALID_ITEM_NAME: Menu item name must be at least 2 characters.");
      }
      updates.name = trimmed;
    }

    if (args.pricePaise !== undefined) {
      if (!Number.isInteger(args.pricePaise) || args.pricePaise <= 0) {
        throw new Error("INVALID_PRICE: Price in paise must be a positive integer greater than 0.");
      }
      updates.pricePaise = args.pricePaise;
    }

    if (args.categoryId !== undefined) {
      const category = await ctx.db.get(args.categoryId);
      if (!category) {
        throw new Error("CATEGORY_NOT_FOUND: Assigned menu category does not exist.");
      }
      updates.categoryId = args.categoryId;
    }

    if (args.imageUrl !== undefined && args.imageUrl !== "") {
      try {
        new URL(args.imageUrl);
      } catch {
        throw new Error("INVALID_IMAGE_URL: Provided image URL is not a valid URL.");
      }
      updates.imageUrl = args.imageUrl.trim();
    } else if (args.imageUrl === "") {
      updates.imageUrl = undefined;
    }

    if (args.description !== undefined) {
      updates.description = args.description.trim();
    }

    if (args.isAvailable !== undefined) {
      updates.isAvailable = args.isAvailable;
    }

    if (args.requiresAgeConfirmation !== undefined) {
      updates.requiresAgeConfirmation = args.requiresAgeConfirmation;
    }

    if (args.displayOrder !== undefined) {
      updates.displayOrder = args.displayOrder;
    }

    await ctx.db.patch(args.menuItemId, updates);
    return { success: true, menuItemId: args.menuItemId };
  },
});

/**
 * Staff mutation: Toggle 86/out-of-stock availability on a menu item.
 * Guarded by requireStaff (permitted for kitchen_staff and admin).
 *
 * MANDATORY SECURITY CONSTRAINT:
 * This mutation explicitly takes ONLY menuItemId and isAvailable.
 * Staff CANNOT modify price, description, name, or category through this mutation.
 */
export const toggleItemAvailability = mutation({
  args: {
    menuItemId: v.id("menuItems"),
    isAvailable: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx);

    const item = await ctx.db.get(args.menuItemId);
    if (!item) {
      throw new Error("ITEM_NOT_FOUND: Menu item not found.");
    }

    const now = Date.now();
    await ctx.db.patch(args.menuItemId, {
      isAvailable: args.isAvailable,
      updatedAt: now,
    });

    return {
      success: true,
      menuItemId: args.menuItemId,
      isAvailable: args.isAvailable,
      updatedAt: now,
    };
  },
});

/**
 * Admin mutation: Delete a menu item.
 * Guarded strictly by requireAdmin.
 */
export const deleteMenuItem = mutation({
  args: {
    menuItemId: v.id("menuItems"),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const item = await ctx.db.get(args.menuItemId);
    if (!item) {
      throw new Error("ITEM_NOT_FOUND: Menu item not found.");
    }

    await ctx.db.delete(args.menuItemId);
    return { success: true, menuItemId: args.menuItemId };
  },
});

