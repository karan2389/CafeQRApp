import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { requireAdminApi } from "@/lib/auth/admin";
import { getAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    // 1. Verify caller is authenticated admin
    const auth = await requireAdminApi();
    if (!auth.authorized) {
      return auth.response;
    }

    const body = (await request.json()) as { tableId?: string };
    const tableId = body.tableId;
    if (!tableId) {
      return NextResponse.json({ error: "tableId is required" }, { status: 400 });
    }

    const adminClient = getAdminClient();

    // 2. Validate table exists and is active
    const { data: tableData, error: tableErr } = await adminClient
      .from("tables")
      .select("id, is_active")
      .eq("id", tableId)
      .maybeSingle();

    if (tableErr) {
      console.error("[RegenerateQR] Table lookup error:", tableErr);
      return NextResponse.json({ error: "Database error during table lookup" }, { status: 500 });
    }

    if (!tableData) {
      return NextResponse.json({ error: "Table not found" }, { status: 404 });
    }

    if (!tableData.is_active) {
      return NextResponse.json({ error: "Cannot generate QR code for an inactive table" }, { status: 400 });
    }

    // 3. Generate new cryptographic token and its SHA-256 hash
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    // 4. Update table_qr_tokens using service role
    const { data, error } = await adminClient
      .from("table_qr_tokens")
      .upsert(
        {
          table_id: tableId,
          qr_token_hash: tokenHash,
          generated_at: new Date().toISOString(),
        },
        { onConflict: "table_id" }
      )
      .select("table_id, generated_at")
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      token: rawToken,
      generatedAt: data.generated_at,
    });
  } catch (err: unknown) {
    console.error("[RegenerateQR] Failed to regenerate QR token:", err);
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
