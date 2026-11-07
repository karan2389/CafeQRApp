import { NextRequest, NextResponse } from "next/server";

interface OrderRequestItem {
  menuItemId: string;
  quantity: number;
  customization?: string;
}

interface CreateOrderPayload {
  items: OrderRequestItem[];
  customerName?: string;
  kitchenNote?: string;
  idempotencyKey?: string;
}

function resolveConvexSiteUrl(): string {
  const url =
    process.env.NEXT_PUBLIC_CONVEX_SITE_URL ||
    process.env.CONVEX_SITE_URL ||
    (process.env.NEXT_PUBLIC_CONVEX_URL
      ? process.env.NEXT_PUBLIC_CONVEX_URL.replace(/\.cloud$/, ".site")
      : "");
  return url.replace(/\/+$/, "");
}

/**
 * GET /api/orders
 * Returns customer orders for the active table session.
 */
export async function GET(request: NextRequest) {
  const sessionCookie = request.cookies.get("cafe_customer_session")?.value;
  if (!sessionCookie) {
    return NextResponse.json(
      { error: "Unauthorized: Missing customer session", is_session_closed: true },
      { status: 401 }
    );
  }

  // Under Convex, real-time reactive queries are consumed directly via useQuery(api.orders.getCustomerTableOrders).
  // This endpoint returns a status acknowledgment for any legacy callers or health checks.
  return NextResponse.json({
    orders: [],
    session_status: "ACTIVE",
    is_session_closed: false,
    message: "Orders are reactively synchronized via Convex.",
  });
}

/**
 * POST /api/orders
 * Server-mediated customer order placement.
 * Reads the HttpOnly cafe_customer_session cookie, verifies input parameters,
 * and calls the secure Convex HTTP Action using CONVEX_SERVER_SECRET.
 */
export async function POST(request: NextRequest) {
  const sessionCookie = request.cookies.get("cafe_customer_session")?.value;
  if (!sessionCookie) {
    return NextResponse.json(
      { error: "Unauthorized: Missing customer session cookie. Please scan table QR code." },
      { status: 401 }
    );
  }

  const serverSecret = process.env.CONVEX_SERVER_SECRET;
  const siteUrl = resolveConvexSiteUrl();

  if (!serverSecret || !siteUrl) {
    return NextResponse.json(
      { error: "Convex backend environment is not configured." },
      { status: 503 }
    );
  }

  try {
    const body = (await request.json()) as CreateOrderPayload;
    const { items, customerName, kitchenNote, idempotencyKey } = body;

    // Validate items
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "Order must contain at least one item." },
        { status: 400 }
      );
    }

    if (items.length > 50) {
      return NextResponse.json(
        { error: "Order item limit exceeded (maximum 50 items)." },
        { status: 400 }
      );
    }

    for (const item of items) {
      if (!item.menuItemId || typeof item.menuItemId !== "string") {
        return NextResponse.json(
          { error: "Invalid menu item identifier." },
          { status: 400 }
        );
      }
      if (
        typeof item.quantity !== "number" ||
        !Number.isInteger(item.quantity) ||
        item.quantity <= 0 ||
        item.quantity > 50
      ) {
        return NextResponse.json(
          { error: "Invalid item quantity. Must be an integer between 1 and 50." },
          { status: 400 }
        );
      }
    }

    const payload = {
      rawCustomerWriteToken: sessionCookie,
      items: items.map((i) => ({
        menuItemId: i.menuItemId,
        quantity: i.quantity,
        customizationNotes: i.customization?.trim() || kitchenNote?.trim() || undefined,
      })),
      customerName: customerName?.trim() || undefined,
      orderNotes: kitchenNote?.trim() || undefined,
      idempotencyKey: idempotencyKey?.trim() || undefined,
    };

    const endpoint = `${siteUrl}/server/orders/submit`;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serverSecret}`,
      },
      body: JSON.stringify(payload),
    });

    const data = (await res.json()) as {
      error?: string;
      success?: boolean;
      orderId?: string;
      orderNumber?: string;
      totalAmountPaise?: number;
      status?: string;
      placedAt?: number;
      isDuplicateReplay?: boolean;
    };

    if (!res.ok || !data.orderId) {
      console.error("[OrdersAPI:POST] Convex order placement failed:", res.status, data.error);
      const isClosed =
        data.error?.includes("SESSION_CLOSED") ||
        data.error?.includes("inactive or revoked");
      return NextResponse.json(
        {
          error: isClosed ? "SESSION_CLOSED" : data.error || "Order placement failed.",
          message: data.error,
        },
        { status: 400 }
      );
    }

    const orderNumber = data.orderNumber || `#${data.orderId.slice(-4)}`;
    const totalAmountPaise = data.totalAmountPaise ?? 0;

    return NextResponse.json({
      success: true,
      order: {
        id: data.orderId,
        orderNumber,
        totalAmountInr: totalAmountPaise / 100,
        totalAmountPaise,
        status: data.status || "NEW",
        createdAt: data.placedAt ? new Date(data.placedAt).toISOString() : new Date().toISOString(),
        isDuplicateReplay: Boolean(data.isDuplicateReplay),
      },
    });
  } catch (err: unknown) {
    console.error("[OrdersAPI:POST] Unexpected exception:", err);
    return NextResponse.json(
      { error: "Internal server error while processing order." },
      { status: 500 }
    );
  }
}
