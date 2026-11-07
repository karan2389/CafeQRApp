import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { auth } from "./auth";

const http = httpRouter();

// Register Convex Auth endpoints (JWKS at /.well-known/jwks.json, OpenID config)
auth.addHttpRoutes(http);

/**
 * Constant-time string equality check to prevent timing attacks on secrets.
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Authorizes trusted Next.js server requests using Bearer CONVEX_SERVER_SECRET.
 * Returns null if authorized, or a rejection Response if unauthorized.
 */
function authorizeServerRequest(request: Request): Response | null {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return new Response(
      JSON.stringify({ error: "UNAUTHORIZED: Missing or malformed authorization header." }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  const token = authHeader.slice(7).trim();
  const serverSecret = process.env.CONVEX_SERVER_SECRET;

  if (!serverSecret || !constantTimeEqual(token, serverSecret)) {
    return new Response(
      JSON.stringify({ error: "FORBIDDEN: Server authentication failed." }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  return null;
}

/**
 * Server-to-Convex HTTP Action: Physical Table QR Stand Scan Resolution.
 * Invoked strictly by Next.js Server Route Handler during dining table scan.
 */
http.route({
  path: "/server/sessions/resolve-scan",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // 1. Authorize server identity
    const unauthorizedResponse = authorizeServerRequest(request);
    if (unauthorizedResponse) return unauthorizedResponse;

    // 2. Parse request payload
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return new Response(
        JSON.stringify({ error: "BAD_REQUEST: Invalid JSON payload." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const tableSlug = typeof body.tableSlug === "string" ? body.tableSlug : null;
    const qrToken = typeof body.qrToken === "string" ? body.qrToken : null;
    const rawCustomerWriteToken = typeof body.rawCustomerWriteToken === "string" ? body.rawCustomerWriteToken : null;
    const rawReadCapabilityToken = typeof body.rawReadCapabilityToken === "string" ? body.rawReadCapabilityToken : null;

    if (!tableSlug || !qrToken || !rawCustomerWriteToken || !rawReadCapabilityToken) {
      return new Response(
        JSON.stringify({ error: "BAD_REQUEST: Missing required session resolution arguments." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 3. Delegate to internalMutation
    try {
      const sessionResult = await ctx.runMutation(internal.sessions.resolveTableScanInternal, {
        tableSlug,
        qrToken,
        rawCustomerWriteToken,
        rawReadCapabilityToken,
      });

      return new Response(JSON.stringify(sessionResult), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return new Response(JSON.stringify({ error: errorMessage }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

/**
 * Server-to-Convex HTTP Action: Customer Order Placement.
 * Invoked strictly by Next.js Server Route Handler reading customer HttpOnly cookie.
 */
http.route({
  path: "/server/orders/submit",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // 1. Authorize server identity
    const unauthorizedResponse = authorizeServerRequest(request);
    if (unauthorizedResponse) return unauthorizedResponse;

    // 2. Parse request payload
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return new Response(
        JSON.stringify({ error: "BAD_REQUEST: Invalid JSON payload." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const rawCustomerWriteToken = typeof body.rawCustomerWriteToken === "string" ? body.rawCustomerWriteToken : null;
    const items = Array.isArray(body.items) ? body.items : null;

    if (!rawCustomerWriteToken || !items) {
      return new Response(
        JSON.stringify({ error: "BAD_REQUEST: Missing required order placement arguments (rawCustomerWriteToken, items)." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 3. Delegate to internalMutation
    try {
      const orderResult = await ctx.runMutation(internal.orders.submitCustomerOrderInternal, {
        rawCustomerWriteToken,
        items: items as Array<{
          menuItemId: Id<"menuItems">;
          quantity: number;
          customizationNotes?: string;
        }>,
        customerName: typeof body.customerName === "string" ? body.customerName : undefined,
        orderNotes: typeof body.orderNotes === "string" ? body.orderNotes : undefined,
        idempotencyKey: typeof body.idempotencyKey === "string" ? body.idempotencyKey : undefined,
        clientClaimedTotalPaise: typeof body.clientClaimedTotalPaise === "number" ? body.clientClaimedTotalPaise : undefined,
      });

      return new Response(JSON.stringify(orderResult), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return new Response(JSON.stringify({ error: errorMessage }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

/**
 * Server-to-Convex HTTP Action: Customer Service Request Creation (Call Staff / Water / Bill).
 * Invoked strictly by Next.js Server Route Handler reading customer HttpOnly cookie.
 */
http.route({
  path: "/server/service-requests/create",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // 1. Authorize server identity
    const unauthorizedResponse = authorizeServerRequest(request);
    if (unauthorizedResponse) return unauthorizedResponse;

    // 2. Parse request payload
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return new Response(
        JSON.stringify({ error: "BAD_REQUEST: Invalid JSON payload." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const rawCustomerWriteToken = typeof body.rawCustomerWriteToken === "string" ? body.rawCustomerWriteToken : null;
    const requestType = typeof body.requestType === "string" ? body.requestType : null;

    if (!rawCustomerWriteToken || !requestType) {
      return new Response(
        JSON.stringify({ error: "BAD_REQUEST: Missing required service request arguments (rawCustomerWriteToken, requestType)." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const validTypes = ["CALL_STAFF", "REQUEST_WATER", "REQUEST_BILL", "REQUEST_ASSISTANCE"];
    if (!validTypes.includes(requestType)) {
      return new Response(
        JSON.stringify({ error: `BAD_REQUEST: Invalid requestType "${requestType}".` }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 3. Delegate to internalMutation
    try {
      const serviceResult = await ctx.runMutation(internal.service_requests.createServiceRequestInternal, {
        rawCustomerWriteToken,
        requestType: requestType as "CALL_STAFF" | "REQUEST_WATER" | "REQUEST_BILL" | "REQUEST_ASSISTANCE",
        note: typeof body.note === "string" ? body.note : undefined,
      });

      return new Response(JSON.stringify(serviceResult), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return new Response(JSON.stringify({ error: errorMessage }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

export default http;
