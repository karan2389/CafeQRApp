import { NextRequest, NextResponse } from "next/server";
import { requireStaffApi } from "@/lib/auth/staff";
import { getAdminClient } from "@/lib/supabase/admin";

interface CloseSessionPayload {
  paymentMethod?: "CASH" | "CARD" | "UPI" | "OTHER";
  force?: boolean;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * POST /api/staff/table-sessions/[id]/close
 * Confirms physical payment (Cash/Card/UPI) and closes the table session.
 * Restricted to authenticated staff and administrators.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireStaffApi();
  if (!auth.authorized) {
    return auth.response;
  }

  const { id } = await params;
  if (!id || !UUID_REGEX.test(id)) {
    return NextResponse.json(
      { error: "INVALID_SESSION_ID", message: "Invalid table session ID." },
      { status: 400 }
    );
  }

  let body: CloseSessionPayload = {};
  try {
    body = (await request.json()) as CloseSessionPayload;
  } catch {
    // optional payload
  }

  const paymentMethod = body.paymentMethod || "CASH";
  const force = Boolean(body.force);
  const adminClient = getAdminClient();

  try {
    // 1. Primary path: Attempt atomic PostgreSQL function close_table_session
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rpcData, error: rpcError } = await (adminClient.rpc as any)("close_table_session", {
      p_session_id: id,
      p_staff_user_id: auth.user.id,
      p_payment_method: paymentMethod,
      p_force: force,
    });

    if (!rpcError && rpcData) {
      const result = typeof rpcData === "string" ? JSON.parse(rpcData) : rpcData;
      if (!result.success) {
        if (result.error_code === "SESSION_ALREADY_CLOSED") {
          return NextResponse.json(
            { error: "SESSION_ALREADY_CLOSED", message: result.message, session: result },
            { status: 409 }
          );
        }
        if (result.error_code === "SESSION_NOT_FOUND") {
          return NextResponse.json(
            { error: "SESSION_NOT_FOUND", message: result.message },
            { status: 404 }
          );
        }
        if (result.error_code === "SESSION_HAS_UNFINISHED_ORDERS") {
          return NextResponse.json(
            { error: "SESSION_HAS_UNFINISHED_ORDERS", message: result.message, unfinishedCount: result.unfinished_count },
            { status: 400 }
          );
        }
        return NextResponse.json({ error: result.error_code || "CLOSURE_FAILED", message: result.message }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        message: "Table session closed and payment confirmed.",
        session: result,
      });
    }

    // 2. Resilient fallback path: If RPC is not yet registered in remote database
    console.warn("[TableSession:Close] RPC unavailable or returned error, running resilient fallback:", rpcError?.message);

    // Fetch existing session
    const { data: session, error: sessionFetchErr } = await adminClient
      .from("table_order_sessions")
      .select("id, status, table_id, closed_at")
      .eq("id", id)
      .maybeSingle();

    if (sessionFetchErr || !session) {
      return NextResponse.json(
        { error: "SESSION_NOT_FOUND", message: "Table session not found." },
        { status: 404 }
      );
    }

    if (session.status === "CLOSED") {
      return NextResponse.json(
        { error: "SESSION_ALREADY_CLOSED", message: "This table session has already been closed." },
        { status: 409 }
      );
    }

    // Check for unfinished orders
    const { data: unfinishedOrders, error: unfinishedErr } = await adminClient
      .from("orders")
      .select("id, order_number, status")
      .eq("table_order_session_id", id)
      .in("status", ["PENDING", "NEW", "PREPARING"]);

    if (!unfinishedErr && unfinishedOrders && unfinishedOrders.length > 0 && !force) {
      return NextResponse.json(
        {
          error: "SESSION_HAS_UNFINISHED_ORDERS",
          message: `Table session has ${unfinishedOrders.length} unfinished order(s). Please resolve them before closing or confirm with override.`,
          unfinishedCount: unfinishedOrders.length,
          orders: unfinishedOrders,
        },
        { status: 400 }
      );
    }

    // Calculate bill from non-cancelled orders
    const { data: validOrders, error: ordersErr } = await adminClient
      .from("orders")
      .select("id, total_amount_inr, status")
      .eq("table_order_session_id", id)
      .neq("status", "CANCELLED");

    if (ordersErr) {
      console.error("[TableSession:Close] Failed to query orders:", ordersErr);
      return NextResponse.json({ error: "Failed to calculate final bill." }, { status: 500 });
    }

    const totalInr = (validOrders || []).reduce((sum, o) => sum + Number(o.total_amount_inr || 0), 0);
    const totalPaise = Math.round(totalInr * 100);
    const now = new Date().toISOString();

    // Atomic update with status guard
    const { data: updatedSession, error: updateErr } = await adminClient
      .from("table_order_sessions")
      .update({
        status: "CLOSED",
        closed_at: now,
        closed_by: auth.user.id,
        payment_confirmed_at: now,
        payment_confirmed_by: auth.user.id,
        payment_method: paymentMethod,
        final_bill_amount_inr: totalInr,
        final_bill_amount_paise: totalPaise,
      })
      .eq("id", id)
      .eq("status", "ACTIVE")
      .select()
      .maybeSingle();

    if (updateErr) {
      // In case newly added columns are not yet in remote DB schema, fallback to minimal update
      const { data: minUpdate, error: minErr } = await adminClient
        .from("table_order_sessions")
        .update({
          status: "CLOSED",
          closed_at: now,
        })
        .eq("id", id)
        .eq("status", "ACTIVE")
        .select()
        .maybeSingle();

      if (minErr || !minUpdate) {
        return NextResponse.json(
          { error: "SESSION_ALREADY_CLOSED", message: "Concurrent closure conflict. Session may have already been closed." },
          { status: 409 }
        );
      }
    } else if (!updatedSession) {
      return NextResponse.json(
        { error: "SESSION_ALREADY_CLOSED", message: "Concurrent closure conflict. Session may have already been closed." },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Table session closed and payment confirmed.",
      session: {
        session_id: id,
        status: "CLOSED",
        closed_at: now,
        closed_by: auth.user.id,
        payment_method: paymentMethod,
        final_bill_amount_inr: totalInr,
        final_bill_amount_paise: totalPaise,
        order_count: (validOrders || []).length,
      },
    });
  } catch (err: unknown) {
    console.error("[TableSession:Close] Exception:", err);
    return NextResponse.json({ error: "INTERNAL_ERROR", message: "Failed to close table session." }, { status: 500 });
  }
}
