import { NextRequest, NextResponse } from "next/server";
import { requireStaffApi } from "@/lib/auth/staff";
import { getAdminClient } from "@/lib/supabase/admin";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * GET /api/staff/table-sessions/[id]/summary
 * Returns billing breakdown, order statuses, and unfinished order warnings for a table session.
 * Restricted to authenticated staff and administrators.
 */
export async function GET(
  _request: NextRequest,
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

  try {
    const adminClient = getAdminClient();

    // 1. Fetch table session and related table
    const { data: session, error: sessionErr } = await adminClient
      .from("table_order_sessions")
      .select(`
        id,
        table_id,
        status,
        created_at,
        closed_at,
        tables!inner(
          id,
          table_number,
          display_name
        )
      `)
      .eq("id", id)
      .maybeSingle();

    if (sessionErr || !session) {
      return NextResponse.json(
        { error: "SESSION_NOT_FOUND", message: "Table session not found." },
        { status: 404 }
      );
    }

    // 2. Fetch all orders and items
    const { data: orders, error: ordersErr } = await adminClient
      .from("orders")
      .select(`
        id,
        order_number,
        customer_name,
        order_notes,
        total_amount_inr,
        status,
        created_at,
        order_items(
          id,
          item_name,
          unit_price_inr,
          quantity,
          customization_notes
        )
      `)
      .eq("table_order_session_id", id)
      .order("created_at", { ascending: true });

    if (ordersErr) {
      console.error("[TableSession:Summary] Orders query error:", ordersErr);
      return NextResponse.json({ error: "Failed to fetch orders." }, { status: 500 });
    }

    const allOrders = orders || [];
    const unfinishedOrders = allOrders.filter((o) =>
      ["PENDING", "NEW", "PREPARING"].includes(o.status)
    );
    const deliveredOrders = allOrders.filter((o) => o.status === "DELIVERED");
    const cancelledOrders = allOrders.filter((o) => o.status === "CANCELLED");
    const nonCancelledOrders = allOrders.filter((o) => o.status !== "CANCELLED");

    const finalBillInr = nonCancelledOrders.reduce(
      (sum, o) => sum + Number(o.total_amount_inr || 0),
      0
    );
    const finalBillPaise = Math.round(finalBillInr * 100);

    return NextResponse.json({
      session: {
        id: session.id,
        status: session.status,
        createdAt: session.created_at,
        closedAt: session.closed_at,
        table: session.tables,
      },
      summary: {
        totalOrdersCount: allOrders.length,
        deliveredOrdersCount: deliveredOrders.length,
        cancelledOrdersCount: cancelledOrders.length,
        unfinishedOrdersCount: unfinishedOrders.length,
        hasUnfinishedOrders: unfinishedOrders.length > 0,
        finalBillInr,
        finalBillPaise,
      },
      unfinishedOrders: unfinishedOrders.map((o) => ({
        id: o.id,
        orderNumber: o.order_number,
        status: o.status,
        customerName: o.customer_name,
        createdAt: o.created_at,
      })),
      orders: allOrders,
    });
  } catch (err: unknown) {
    console.error("[TableSession:Summary] Exception:", err);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to load session summary." },
      { status: 500 }
    );
  }
}
