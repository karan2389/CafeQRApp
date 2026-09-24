import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/admin";
import { getAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminApi();
    if (!auth.authorized) {
      return auth.response;
    }

    const body = (await request.json()) as { tableId?: string };
    const tableId = body?.tableId;

    if (!tableId) {
      return NextResponse.json({ error: "Missing tableId" }, { status: 400 });
    }

    const adminClient = getAdminClient();
    const { data: success, error: rpcError } = await (
      adminClient as unknown as {
        rpc: (
          fn: string,
          args: Record<string, unknown>
        ) => Promise<{ data: boolean | null; error: { message: string } | null }>;
      }
    ).rpc("close_table_session", { p_table_id: tableId });

    if (rpcError) {
      console.error("[CLOSE_SESSION_API] RPC Error:", rpcError);
      return NextResponse.json({ error: rpcError.message }, { status: 400 });
    }

    if (!success) {
      return NextResponse.json({ error: "No active session found for this table" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error("[CLOSE_SESSION_API] Unexpected error:", err);
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
