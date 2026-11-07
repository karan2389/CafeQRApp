import { NextRequest, NextResponse } from "next/server";

const VALID_REQUEST_TYPES = [
  "CALL_STAFF",
  "REQUEST_WATER",
  "REQUEST_BILL",
  "REQUEST_ASSISTANCE",
] as const;

type ServiceRequestType = (typeof VALID_REQUEST_TYPES)[number];

interface CreateServiceRequestBody {
  requestType: ServiceRequestType;
  note?: string;
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
 * GET /api/service-requests
 * Returns service requests status for legacy callers.
 */
export async function GET(request: NextRequest) {
  const sessionCookie = request.cookies.get("cafe_customer_session")?.value;
  if (!sessionCookie) {
    return NextResponse.json(
      { error: "Unauthorized: Missing customer session" },
      { status: 401 }
    );
  }

  return NextResponse.json({
    serviceRequests: [],
    requests: [],
    message: "Service requests are reactively synchronized via Convex.",
  });
}

/**
 * POST /api/service-requests
 * Server-mediated customer service request creation.
 * Reads the HttpOnly cafe_customer_session cookie, validates request type,
 * and calls the secure Convex HTTP Action using CONVEX_SERVER_SECRET.
 */
export async function POST(request: NextRequest) {
  const sessionCookie = request.cookies.get("cafe_customer_session")?.value;
  if (!sessionCookie) {
    return NextResponse.json(
      { error: "Unauthorized: Missing customer session cookie. Please scan table QR." },
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
    const body = (await request.json()) as CreateServiceRequestBody;
    const { requestType, note } = body;

    if (!requestType || !VALID_REQUEST_TYPES.includes(requestType)) {
      return NextResponse.json(
        { error: "Invalid service request type. Must be CALL_STAFF, REQUEST_WATER, REQUEST_BILL, or REQUEST_ASSISTANCE." },
        { status: 400 }
      );
    }

    if (note && note.length > 200) {
      return NextResponse.json(
        { error: "Note must be under 200 characters." },
        { status: 400 }
      );
    }

    const endpoint = `${siteUrl}/server/service-requests/create`;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serverSecret}`,
      },
      body: JSON.stringify({
        rawCustomerWriteToken: sessionCookie,
        requestType,
        note: note?.trim() || undefined,
      }),
    });

    const data = (await res.json()) as {
      error?: string;
      success?: boolean;
      requestId?: string;
      tableNumber?: number;
      requestType?: string;
      status?: string;
      createdAt?: number;
    };

    if (!res.ok || !data.requestId) {
      console.error("[ServiceRequests:POST] Convex request creation failed:", res.status, data.error);
      return NextResponse.json(
        { error: data.error || "Failed to submit service request." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      serviceRequest: {
        id: data.requestId,
        tableNumber: data.tableNumber,
        request_type: data.requestType,
        status: data.status || "OPEN",
        createdAt: data.createdAt ? new Date(data.createdAt).toISOString() : new Date().toISOString(),
      },
    });
  } catch (err: unknown) {
    console.error("[ServiceRequests:POST] Unexpected exception:", err);
    return NextResponse.json(
      { error: "Internal server error while processing request." },
      { status: 500 }
    );
  }
}
