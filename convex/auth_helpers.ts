import { QueryCtx, MutationCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";

/**
 * Standard Web Crypto SHA-256 hashing helper.
 * Generates a lowercase 64-character hexadecimal digest.
 */
export async function sha256Hex(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Retrieves the currently authenticated staff or admin user.
 * Validates that the account exists, is active, and has an assigned role.
 * Rejects unauthenticated callers immediately.
 */
export async function getAuthenticatedUser(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("UNAUTHENTICATED: Valid login credentials required.");
  }

  const user = await ctx.db.get(userId);
  if (!user) {
    throw new Error("UNAUTHENTICATED: User account not found.");
  }

  if (!user.isActive) {
    throw new Error("FORBIDDEN: User account is inactive or disabled.");
  }

  if (!user.role) {
    throw new Error("FORBIDDEN: User account has no assigned role.");
  }

  return user as typeof user & { role: "admin" | "kitchen_staff"; isActive: true };
}

/**
 * Server-side authorization guard for kitchen staff and admin operations.
 * Permitted for: role === 'kitchen_staff' or role === 'admin'.
 * Cafe administrators are explicitly granted kitchen staff privileges
 * to oversee dining floor and kitchen lifecycle management.
 */
export async function requireStaff(ctx: QueryCtx | MutationCtx) {
  const user = await getAuthenticatedUser(ctx);
  if (user.role !== "kitchen_staff" && user.role !== "admin") {
    throw new Error("FORBIDDEN: Kitchen staff or Administrator privileges required.");
  }
  return user;
}

/**
 * Server-side authorization guard for administrator-only operations.
 * Permitted strictly for: role === 'admin'.
 * Controls menu creation/edits, table management, QR token regeneration,
 * and user administration.
 */
export async function requireAdmin(ctx: QueryCtx | MutationCtx) {
  const user = await getAuthenticatedUser(ctx);
  if (user.role !== "admin") {
    throw new Error("FORBIDDEN: Administrator privileges required.");
  }
  return user;
}

/**
 * Validates customer read-capability for reactive live queries.
 *
 * Security Model:
 * 1. Client provides customerScanSessionId and rawReadCapabilityToken.
 * 2. Convex computes SHA-256(rawReadCapabilityToken) and checks against readCapabilityTokenHash.
 * 3. Asserts session is active, not revoked, and not expired (12-hour sliding window).
 * 4. Traverses database relationship to the linked tableOrderSession.
 * 5. Asserts linked tableOrderSession is currently ACTIVE.
 *
 * Prevents diners from querying another table's orders, bills, or waiter calls.
 */
export async function validateCustomerReadCapability(
  ctx: QueryCtx,
  customerScanSessionId: Id<"customerScanSessions">,
  rawReadCapabilityToken: string
) {
  if (!rawReadCapabilityToken || typeof rawReadCapabilityToken !== "string") {
    throw new Error("UNAUTHORIZED: Capability token missing or invalid.");
  }

  const scanSession = await ctx.db.get(customerScanSessionId);
  if (!scanSession || !scanSession.isActive || scanSession.revokedAt !== undefined) {
    throw new Error("UNAUTHORIZED: Customer scan session is inactive or revoked.");
  }

  if (Date.now() > scanSession.expiresAt) {
    throw new Error("SESSION_EXPIRED: Customer scan session has expired. Please scan table QR again.");
  }

  const computedHash = await sha256Hex(rawReadCapabilityToken);
  if (scanSession.readCapabilityTokenHash !== computedHash) {
    throw new Error("UNAUTHORIZED: Invalid capability token.");
  }

  const tableOrderSession = await ctx.db.get(scanSession.tableOrderSessionId);
  if (!tableOrderSession) {
    throw new Error("SESSION_NOT_FOUND: Linked dining table session not found.");
  }

  return { scanSession, tableOrderSession };
}

/**
 * Validates customer write session for state mutations (e.g., submitOrder, createServiceRequest).
 *
 * Security Model:
 * 1. Client does NOT pass raw customer tokens via WebSocket.
 * 2. Mutation is invoked through Next.js server route handler that reads the HttpOnly cookie.
 * 3. Server computes SHA-256(cookieValue) and delivers customerTokenHash to Convex.
 * 4. Convex looks up the session by indexed customerTokenHash.
 * 5. Asserts session is active, unrevoked, unexpired, and linked to an ACTIVE tableOrderSession.
 */
export async function validateCustomerWriteSession(
  ctx: QueryCtx | MutationCtx,
  customerTokenHash: string
) {
  if (!customerTokenHash || typeof customerTokenHash !== "string") {
    throw new Error("UNAUTHORIZED: Session token hash missing or invalid.");
  }

  const scanSession = await ctx.db
    .query("customerScanSessions")
    .withIndex("by_customer_token_hash", (q) =>
      q.eq("customerTokenHash", customerTokenHash)
    )
    .first();

  if (!scanSession || !scanSession.isActive || scanSession.revokedAt !== undefined) {
    throw new Error("UNAUTHORIZED: Customer scan session is inactive or revoked.");
  }

  if (Date.now() > scanSession.expiresAt) {
    throw new Error("SESSION_EXPIRED: Customer scan session has expired. Please scan table QR again.");
  }

  const tableOrderSession = await ctx.db.get(scanSession.tableOrderSessionId);
  if (!tableOrderSession || tableOrderSession.status !== "ACTIVE") {
    throw new Error("SESSION_CLOSED: Table dining session is no longer active for orders.");
  }

  return { scanSession, tableOrderSession };
}
