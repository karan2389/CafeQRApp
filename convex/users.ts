import { query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

/**
 * Returns the currently authenticated user's profile and authorization details.
 * Used by Next.js Server Components, client dashboards, and layout guards.
 * Returns null if the caller is unauthenticated.
 */
export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }

    const user = await ctx.db.get(userId);
    if (!user || !user.isActive) {
      return null;
    }

    return {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
    };
  },
});

/**
 * Internal-only bootstrap helper to provision or update the initial
 * single-cafe administrator and kitchen accounts.
 *
 * Security: This is an internalMutation, meaning it CANNOT be invoked directly
 * by client browsers or public HTTP endpoints. It can only be called from CLI
 * scripts (`npx convex run`) or internal deployment hooks.
 */
export const internalUpsertStaffAccount = internalMutation({
  args: {
    email: v.string(),
    name: v.string(),
    role: v.union(v.literal("admin"), v.literal("kitchen_staff")),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.email.toLowerCase()))
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name,
        role: args.role,
        isActive: args.isActive,
        updatedAt: now,
      });
      return { action: "updated", userId: existing._id };
    }

    const userId = await ctx.db.insert("users", {
      email: args.email.toLowerCase(),
      name: args.name,
      role: args.role,
      isActive: args.isActive,
      createdAt: now,
      updatedAt: now,
    });

    return { action: "created", userId };
  },
});

