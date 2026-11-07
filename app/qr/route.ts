import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";

export async function GET(request: NextRequest) {
  return handleQR(request);
}

export async function POST(request: NextRequest) {
  return handleQR(request);
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

async function handleQR(request: NextRequest) {
  let token: string | null = null;
  let slug: string | null = null;

  if (request.method === "GET") {
    token = request.nextUrl.searchParams.get("token");
    slug =
      request.nextUrl.searchParams.get("slug") ||
      request.nextUrl.searchParams.get("table");
  } else if (request.method === "POST") {
    try {
      const body = (await request.json()) as { token?: string; slug?: string; table?: string };
      token = body.token ?? null;
      slug = body.slug ?? body.table ?? null;
    } catch {
      // ignore JSON parse error
    }
  }

  if (!token) {
    return NextResponse.redirect(new URL("/table-invalid?reason=missing_token", request.url));
  }

  // If table slug is not explicitly in parameters, deduce from token or pattern (e.g. table-6 or demo-table-6)
  if (!slug) {
    const match = token.match(/table[_-]?(\d+)/i);
    slug = match ? `table-${match[1]}` : "table-1";
  }

  const serverSecret = process.env.CONVEX_SERVER_SECRET;
  const siteUrl = resolveConvexSiteUrl();

  // If Convex environment is not configured, preserve local demo fallback
  if (!serverSecret || !siteUrl) {
    const response =
      request.method === "POST"
        ? NextResponse.json({ success: true, table_slug: slug, isDemo: true })
        : NextResponse.redirect(new URL(`/table/${slug}`, request.url));

    const demoToken = `demo-session-${crypto.randomBytes(16).toString("hex")}`;
    response.cookies.set({
      name: "cafe_customer_session",
      value: demoToken,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 12,
    });
    return response;
  }

  try {
    // Generate secure customer tokens:
    // rawCustomerWriteToken: Stored in HttpOnly cookie, authenticated by Next.js server route
    // rawReadCapabilityToken: Stored in accessible cookie, passed to reactive Convex queries
    const rawCustomerWriteToken = crypto.randomBytes(32).toString("hex");
    const rawReadCapabilityToken = crypto.randomBytes(32).toString("hex");

    const endpoint = `${siteUrl}/server/sessions/resolve-scan`;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serverSecret}`,
      },
      body: JSON.stringify({
        tableSlug: slug,
        qrToken: token,
        rawCustomerWriteToken,
        rawReadCapabilityToken,
      }),
    });

    const data = (await res.json()) as {
      error?: string;
      tableId?: string;
      tableNumber?: number;
      displayName?: string;
      slug?: string;
      tableOrderSessionId?: string;
      customerScanSessionId?: string;
      expiresAt?: number;
    };

    if (!res.ok || !data.customerScanSessionId) {
      console.error("[QR_ROUTE] Convex resolve-scan error:", res.status, data.error);
      if (data.error?.includes("TABLE_INACTIVE")) {
        return NextResponse.redirect(new URL("/table-invalid?reason=table_inactive", request.url));
      }
      return NextResponse.redirect(new URL("/table-invalid?reason=invalid_token", request.url));
    }

    const resolvedSlug = data.slug || slug;

    // Build response: POST returns JSON; GET redirects cleanly to /table/[slug]
    const response =
      request.method === "POST"
        ? NextResponse.json({
            success: true,
            table_slug: resolvedSlug,
            table_order_session_id: data.tableOrderSessionId,
            customer_scan_session_id: data.customerScanSessionId,
            table_number: data.tableNumber,
          })
        : NextResponse.redirect(new URL(`/table/${resolvedSlug}`, request.url));

    const maxAgeSeconds = 60 * 60 * 12; // 12 hours

    // 1. HttpOnly Write Token (customer write operations)
    response.cookies.set({
      name: "cafe_customer_session",
      value: rawCustomerWriteToken,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: maxAgeSeconds,
    });

    // 2. Client-accessible Read Capability Token (for Convex useQuery subscriptions)
    response.cookies.set({
      name: "cafe_customer_read_token",
      value: rawReadCapabilityToken,
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: maxAgeSeconds,
    });

    // 3. Client-accessible Customer Scan Session ID (for Convex useQuery subscriptions)
    response.cookies.set({
      name: "cafe_customer_scan_id",
      value: data.customerScanSessionId,
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: maxAgeSeconds,
    });

    // 4. Client-accessible Table Order Session ID
    if (data.tableOrderSessionId) {
      response.cookies.set({
        name: "cafe_table_session_id",
        value: data.tableOrderSessionId,
        httpOnly: false,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: maxAgeSeconds,
      });
    }

    // 5. Client-accessible Table Slug
    response.cookies.set({
      name: "cafe_table_slug",
      value: resolvedSlug,
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: maxAgeSeconds,
    });

    return response;
  } catch (err) {
    console.error("[QR_ROUTE] Unexpected exception during scan resolution:", err);
    return NextResponse.redirect(new URL("/table-invalid?reason=server_error", request.url));
  }
}
