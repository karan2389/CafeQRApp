import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { sha256Hex } from "./auth_helpers";

interface DemoItemDef {
  name: string;
  description: string;
  pricePaise: number;
  imageUrl: string;
  isAvailable: boolean;
  requiresAgeConfirmation: boolean;
  displayOrder: number;
}

interface DemoCategoryDef {
  name: string;
  slug: string;
  displayOrder: number;
  isActive: boolean;
  items: DemoItemDef[];
}

export const DEMO_MENU_CATEGORIES: DemoCategoryDef[] = [
  {
    name: "Coffee",
    slug: "coffee",
    displayOrder: 1,
    isActive: true,
    items: [
      {
        name: "Cortado",
        description: "Double espresso softened with warm textured milk.",
        pricePaise: 19000,
        imageUrl: "/menu/cortado.svg",
        isAvailable: true,
        requiresAgeConfirmation: false,
        displayOrder: 1,
      },
      {
        name: "Sea Salt Mocha",
        description: "Dark cocoa, espresso and a delicate sea-salt cream.",
        pricePaise: 26000,
        imageUrl: "/menu/mocha.svg",
        isAvailable: true,
        requiresAgeConfirmation: false,
        displayOrder: 2,
      },
    ],
  },
  {
    name: "Cold",
    slug: "cold",
    displayOrder: 2,
    isActive: true,
    items: [
      {
        name: "Citrus Cold Brew",
        description: "Slow-steeped coffee lifted with orange and tonic.",
        pricePaise: 24000,
        imageUrl: "/menu/cold-brew.svg",
        isAvailable: true,
        requiresAgeConfirmation: false,
        displayOrder: 3,
      },
    ],
  },
  {
    name: "Breakfast",
    slug: "breakfast",
    displayOrder: 3,
    isActive: true,
    items: [
      {
        name: "Forest Toast",
        description: "Sourdough, whipped feta, mushrooms and herbs.",
        pricePaise: 32000,
        imageUrl: "/menu/toast.svg",
        isAvailable: true,
        requiresAgeConfirmation: false,
        displayOrder: 4,
      },
    ],
  },
  {
    name: "Bowls",
    slug: "bowls",
    displayOrder: 4,
    isActive: true,
    items: [
      {
        name: "Harvest Grain Bowl",
        description: "Millets, roasted vegetables, greens and sesame dressing.",
        pricePaise: 36000,
        imageUrl: "/menu/bowl.svg",
        isAvailable: true,
        requiresAgeConfirmation: false,
        displayOrder: 5,
      },
    ],
  },
  {
    name: "Bakes",
    slug: "bakes",
    displayOrder: 5,
    isActive: true,
    items: [
      {
        name: "Burnt Honey Croissant",
        description: "Flaky butter pastry glazed with toasted wildflower honey.",
        pricePaise: 22000,
        imageUrl: "/menu/croissant.svg",
        isAvailable: false,
        requiresAgeConfirmation: false,
        displayOrder: 6,
      },
    ],
  },
  {
    name: "Puffs",
    slug: "puffs",
    displayOrder: 6,
    isActive: true,
    items: [
      {
        name: "Cool Mint",
        description: "A crisp, cool profile with a clean finish.",
        pricePaise: 65000,
        imageUrl: "/menu/puffs.svg",
        isAvailable: true,
        requiresAgeConfirmation: true,
        displayOrder: 7,
      },
      {
        name: "Berry Ice",
        description: "Bright berry notes with a chilled finish.",
        pricePaise: 68000,
        imageUrl: "/menu/puffs.svg",
        isAvailable: true,
        requiresAgeConfirmation: true,
        displayOrder: 8,
      },
      {
        name: "Citrus Rush",
        description: "Fresh citrus with a light cooling edge.",
        pricePaise: 68000,
        imageUrl: "/menu/puffs.svg",
        isAvailable: true,
        requiresAgeConfirmation: true,
        displayOrder: 9,
      },
      {
        name: "Classic Gold",
        description: "A mellow, rounded classic profile.",
        pricePaise: 72000,
        imageUrl: "/menu/puffs.svg",
        isAvailable: false,
        requiresAgeConfirmation: true,
        displayOrder: 10,
      },
    ],
  },
];

/**
 * Idempotently seeds Ember & Oak demo menu categories and items.
 * Updates existing records or creates missing ones.
 */
export const seedDemoMenu = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const results = {
      categoriesCreated: 0,
      categoriesUpdated: 0,
      itemsCreated: 0,
      itemsUpdated: 0,
    };

    for (const catDef of DEMO_MENU_CATEGORIES) {
      let category = await ctx.db
        .query("menuCategories")
        .withIndex("by_slug", (q) => q.eq("slug", catDef.slug))
        .first();

      if (!category) {
        const catId = await ctx.db.insert("menuCategories", {
          name: catDef.name,
          slug: catDef.slug,
          displayOrder: catDef.displayOrder,
          isActive: catDef.isActive,
          createdAt: now,
          updatedAt: now,
        });
        category = await ctx.db.get(catId);
        results.categoriesCreated++;
      } else {
        await ctx.db.patch(category._id, {
          name: catDef.name,
          displayOrder: catDef.displayOrder,
          isActive: catDef.isActive,
          updatedAt: now,
        });
        results.categoriesUpdated++;
      }

      if (!category) continue;

      for (const itemDef of catDef.items) {
        const existingItem = await ctx.db
          .query("menuItems")
          .withIndex("by_category", (q) => q.eq("categoryId", category._id))
          .filter((q) => q.eq(q.field("name"), itemDef.name))
          .first();

        if (!existingItem) {
          await ctx.db.insert("menuItems", {
            categoryId: category._id,
            name: itemDef.name,
            description: itemDef.description,
            pricePaise: itemDef.pricePaise,
            imageUrl: itemDef.imageUrl,
            isAvailable: itemDef.isAvailable,
            requiresAgeConfirmation: itemDef.requiresAgeConfirmation,
            displayOrder: itemDef.displayOrder,
            createdAt: now,
            updatedAt: now,
          });
          results.itemsCreated++;
        } else {
          await ctx.db.patch(existingItem._id, {
            description: itemDef.description,
            pricePaise: itemDef.pricePaise,
            imageUrl: itemDef.imageUrl,
            isAvailable: itemDef.isAvailable,
            requiresAgeConfirmation: itemDef.requiresAgeConfirmation,
            displayOrder: itemDef.displayOrder,
            updatedAt: now,
          });
          results.itemsUpdated++;
        }
      }
    }

    return results;
  },
});

/**
 * Comprehensive seed for Ember & Oak Cafe:
 * - Cafe settings
 * - Tables (1-6)
 * - Menu categories (6)
 * - Menu items (10)
 */
export const seedAll = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // 1. Cafe settings
    const existingSettings = await ctx.db.query("cafeSettings").first();
    if (!existingSettings) {
      await ctx.db.insert("cafeSettings", {
        name: "Ember & Oak",
        slug: "ember-oak",
        currency: "INR",
        phone: "+91 98765 43210",
        address: "12 Artisan Lane, Indiranagar, Bangalore",
        openingHours: "08:00 - 23:00",
        maintenanceMode: false,
        updatedAt: now,
      });
    }

    // 2. Physical Dining Tables (1 to 6)
    for (let tableNumber = 1; tableNumber <= 6; tableNumber++) {
      const tableSlug = `table-${tableNumber}`;
      const existingTable = await ctx.db
        .query("tables")
        .withIndex("by_slug", (q) => q.eq("slug", tableSlug))
        .first();

      if (!existingTable) {
        const qrTokenHash = await sha256Hex(`table-${tableNumber}-secret`);
        await ctx.db.insert("tables", {
          tableNumber,
          displayName: `Table ${tableNumber}`,
          slug: tableSlug,
          isActive: tableNumber !== 5, // Table 5 closed in initial demo state
          qrTokenHash,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    // 3. Demo menu categories and items
    for (const catDef of DEMO_MENU_CATEGORIES) {
      let category = await ctx.db
        .query("menuCategories")
        .withIndex("by_slug", (q) => q.eq("slug", catDef.slug))
        .first();

      if (!category) {
        const catId = await ctx.db.insert("menuCategories", {
          name: catDef.name,
          slug: catDef.slug,
          displayOrder: catDef.displayOrder,
          isActive: catDef.isActive,
          createdAt: now,
          updatedAt: now,
        });
        category = await ctx.db.get(catId);
      } else {
        await ctx.db.patch(category._id, {
          name: catDef.name,
          displayOrder: catDef.displayOrder,
          isActive: catDef.isActive,
          updatedAt: now,
        });
      }

      if (!category) continue;

      for (const itemDef of catDef.items) {
        const existingItem = await ctx.db
          .query("menuItems")
          .withIndex("by_category", (q) => q.eq("categoryId", category._id))
          .filter((q) => q.eq(q.field("name"), itemDef.name))
          .first();

        if (!existingItem) {
          await ctx.db.insert("menuItems", {
            categoryId: category._id,
            name: itemDef.name,
            description: itemDef.description,
            pricePaise: itemDef.pricePaise,
            imageUrl: itemDef.imageUrl,
            isAvailable: itemDef.isAvailable,
            requiresAgeConfirmation: itemDef.requiresAgeConfirmation,
            displayOrder: itemDef.displayOrder,
            createdAt: now,
            updatedAt: now,
          });
        } else {
          await ctx.db.patch(existingItem._id, {
            description: itemDef.description,
            pricePaise: itemDef.pricePaise,
            imageUrl: itemDef.imageUrl,
            isAvailable: itemDef.isAvailable,
            requiresAgeConfirmation: itemDef.requiresAgeConfirmation,
            displayOrder: itemDef.displayOrder,
            updatedAt: now,
          });
        }
      }
    }

    return { success: true, message: "Ember & Oak database fully initialized with tables, settings, and demo menu." };
  },
});

export const resetUserForPasswordSync = mutation({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const email = args.email.toLowerCase().trim();
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .first();

    if (!user) {
      return { found: false };
    }

    // Delete associated auth accounts so password can be cleanly reset via signUp
    const authAccounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", user._id))
      .collect();

    for (const acc of authAccounts) {
      await ctx.db.delete(acc._id);
    }

    // Delete any active sessions
    const authSessions = await ctx.db
      .query("authSessions")
      .withIndex("userId", (q) => q.eq("userId", user._id))
      .collect();

    for (const s of authSessions) {
      await ctx.db.delete(s._id);
    }

    await ctx.db.delete(user._id);

    return { found: true, deletedUserId: user._id };
  },
});

