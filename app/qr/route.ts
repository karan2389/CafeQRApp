import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { getAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseConfigured } from "@/lib/supabase/client";
import { getAppConfig } from "@/lib/config/env";

export async function GET(request: NextRequest) {
  return handleQR(request);
}

export async function POST(request: NextRequest) {
  return handleQR(request);
}

async function handleQR(request: NextRequest) {
  let token: string | null = null;
  
  if (request.method === "GET") {
    token = request.nextUrl.searchParams.get("token");
  } else if (request.method === "POST") {
    try {
      const body = (await request.json()) as { token?: string };
      token = body.token ?? null;
    } catch {
      // ignore
    }
  }

  if (!token) {
    return NextResponse.redirect(new URL("/table-invalid?reason=missing_token", request.url));
  }

  // If Supabase is not configured, support local demo tokens for testing
  const config = getAppConfig();
  const isSupabaseReady = hasSupabaseConfigured() && Boolean(config.supabase?.serviceRoleKey);

  if (!isSupabaseReady) {
    // Local demo fallback: match table-X or default to table-1
    const match = token.match(/table[_-]?(\d+)/i);
    const tableNum = match ? match[1] : "1";
    const response = NextResponse.redirect(new URL(`/table/table-${tableNum}`, request.url));
    response.cookies.set({
      name: "cafe_customer_session",
      value: `demo-session-${crypto.randomBytes(16).toString("hex")}`,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 12,
    });
    return response;
  }

  try {
    const adminClient = getAdminClient();
    const qrTokenHash = crypto.createHash("sha256").update(token).digest("hex");
    
    // Generate the customer token securely
    const customerToken = crypto.randomBytes(32).toString("hex");
    const customerTokenHash = crypto.createHash("sha256").update(customerToken).digest("hex");

    // Call atomic RPC to resolve everything
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: sessionData, error: sessionError } = await (adminClient.rpc as any)('resolve_qr_scan', {
      p_qr_token_hash: qrTokenHash,
      p_customer_token_hash: customerTokenHash
    });

    const sessionList = sessionData as Array<{ table_slug: string; table_order_session_id: string }> | null;
    if (sessionError || !sessionList || sessionList.length === 0) {
      console.error("[QR_ROUTE] RPC Error or Invalid Token:", sessionError);
      return NextResponse.redirect(new URL("/table-invalid?reason=invalid_token", request.url));
    }

    const { table_slug, table_order_session_id } = sessionList[0];

    // Set HTTP-only secure cookies
    // For GET requests we redirect, for POST we can return JSON
    if (request.method === "POST") {
      const response = NextResponse.json({ success: true, table_slug, table_order_session_id });
      response.cookies.set({
        name: "cafe_customer_session",
        value: customerToken,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 12,
      });
      response.cookies.set({
        name: "cafe_table_session_id",
        value: table_order_session_id,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 12,
      });
      return response;
    }

    const response = NextResponse.redirect(new URL(`/table/${table_slug}`, request.url));
    response.cookies.set({
      name: "cafe_customer_session",
      value: customerToken,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 12,
    });

    response.cookies.set({
      name: "cafe_table_session_id",
      value: table_order_session_id,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 12,
    });

    return response;
  } catch (err) {
    console.error("[QR_ROUTE] Unexpected exception:", err);
    return NextResponse.redirect(new URL("/table-invalid?reason=server_error", request.url));
  }
}
