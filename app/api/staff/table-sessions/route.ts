import { NextResponse } from "next/server";
import { requireStaffApi } from "@/lib/auth/staff";
import { getAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/staff/table-sessions
 * Returns all tables with their current active table sessions and running billing summaries.
 * Restricted to authenticated staff and administrators.
 */
export async function GET() {
  const auth = await requireStaffApi();
  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const adminClient = getAdminClient();

    // 1. Fetch tables
    const { data: tables, error: tablesErr } = await adminClient
      .from("tables")
      .select("id, table_number, display_name, is_active")
      .order("table_number", { ascending: true });

    if (tablesErr || !tables) {
      console.error("[TableSessions:List] Failed to fetch tables:", tablesErr);
      return NextResponse.json({ error: "Failed to fetch tables." }, { status: 500 });
    }

    // 2. Fetch active table sessions
    const { data: activeSessions, error: sessionsErr } = await adminClient
      .from("table_order_sessions")
      .select("id, table_id, status, created_at")
      .eq("status", "ACTIVE");

    if (sessionsErr) {
      console.error("[TableSessions:List] Failed to fetch active sessions:", sessionsErr);
      return NextResponse.json({ error: "Failed to fetch active sessions." }, { status: 500 });
    }

    const sessionByTableId = new Map(
      (activeSessions || []).map((s) => [s.table_id, s])
    );

    const activeSessionIds = (activeSessions || []).map((s) => s.id);

    // 3. Fetch orders for all active sessions in one query
    let ordersForActiveSessions: Array<{
      id: string;
      table_order_session_id: string;
      status: string;
      total_amount_inr: number;
    }> = [];

    if (activeSessionIds.length > 0) {
      const { data: ordersData, error: ordersErr } = await adminClient
        .from("orders")
        .select("id, table_order_session_id, status, total_amount_inr")
        .in("table_order_session_id", activeSessionIds);

      if (!ordersErr && ordersData) {
        ordersForActiveSessions = ordersData;
      }
    }

    // Map orders to session
    const ordersBySessionId = new Map<string, typeof ordersForActiveSessions>();
    for (const order of ordersForActiveSessions) {
      const existing = ordersBySessionId.get(order.table_order_session_id) || [];
      existing.push(order);
      ordersBySessionId.set(order.table_order_session_id, existing);
    }

    // 4. Construct table session summaries
    const tableSummaries = tables.map((t) => {
      const activeSession = sessionByTableId.get(t.id);
      if (!activeSession) {
        return {
          tableId: t.id,
          tableNumber: t.table_number,
          displayName: t.display_name,
          isActive: t.is_active,
          hasActiveSession: false,
          session: null,
          runningBillInr: 0,
          totalOrdersCount: 0,
          deliveredOrdersCount: 0,
          unfinishedOrdersCount: 0,
        };
      }

      const orders = ordersBySessionId.get(activeSession.id) || [];
      const nonCancelled = orders.filter((o) => o.status !== "CANCELLED");
      const delivered = orders.filter((o) => o.status === "DELIVERED");
      const unfinished = orders.filter((o) =>
        ["PENDING", "NEW", "PREPARING"].includes(o.status)
      );
      const runningBillInr = nonCancelled.reduce(
        (sum, o) => sum + Number(o.total_amount_inr || 0),
        0
      );

      return {
        tableId: t.id,
        tableNumber: t.table_number,
        displayName: t.display_name,
        isActive: t.is_active,
        hasActiveSession: true,
        session: {
          id: activeSession.id,
          status: activeSession.status,
          createdAt: activeSession.created_at,
        },
        runningBillInr,
        totalOrdersCount: orders.length,
        deliveredOrdersCount: delivered.length,
        unfinishedOrdersCount: unfinished.length,
      };
    });

    return NextResponse.json({ tables: tableSummaries });
  } catch (err: unknown) {
    console.error("[TableSessions:List] Exception:", err);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to list table sessions." },
      { status: 500 }
    );
  }
}
