import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { getAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseConfigured } from "@/lib/supabase/client";

export async function POST(request: NextRequest) {
  if (!hasSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const sessionCookie = request.cookies.get("cafe_customer_session")?.value;

  if (!sessionCookie) {
    return NextResponse.json({ error: "Unauthorized: Missing session cookie" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { items?: unknown[] };
    const { items } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Invalid order payload" }, { status: 400 });
    }

    const sessionHash = crypto.createHash("sha256").update(sessionCookie).digest("hex");
    const adminClient = getAdminClient();

    // 1. Verify session hash is valid, active, and not expired
    const { data: scanSession, error: sessionError } = await adminClient
      .from("customer_scan_sessions")
      .select(`
        id,
        table_order_session_id,
        table_order_sessions!inner(status)
      `)
      .eq("session_token_hash", sessionHash)
      .gt("expires_at", new Date().toISOString())
      .single();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (sessionError || !scanSession || (scanSession.table_order_sessions as any)?.status !== "ACTIVE") {
      return NextResponse.json({ error: "Invalid, expired, or closed session" }, { status: 403 });
    }

    // 2. Call the submit_table_order RPC
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: orderId, error: rpcError } = await (adminClient.rpc as any)("submit_table_order", {
      p_scan_session_id: scanSession.id,
      p_items: items,
    });

    if (rpcError) {
      console.error("[ORDERS_API] RPC Error:", rpcError);
      return NextResponse.json({ error: rpcError.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, orderId });
  } catch (err) {
    console.error("[ORDERS_API] Unexpected error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
