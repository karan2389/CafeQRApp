import { NextResponse } from "next/server";
import { requireStaffApi } from "@/lib/auth/staff";
import { getAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/staff/orders
 * Returns all recent orders for the kitchen dashboard.
 * Restricted to authenticated staff and administrators.
 * Includes defensive fallback if Phase 4 migration columns are pending.
 */
export async function GET() {
  const auth = await requireStaffApi();
  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const adminClient = getAdminClient();

    // 1. Attempt complete query including Phase 4 cancellation_reason
    const { data: ordersWithReason, error: errWithReason } = await adminClient
      .from("orders")
      .select(`
        id,
        order_number,
        customer_name,
        order_notes,
        total_amount_inr,
        status,
        cancellation_reason,
        created_at,
        updated_at,
        tables!inner(
          id,
          table_number,
          display_name
        ),
        order_items(
          id,
          item_name,
          unit_price_inr,
          quantity,
          customization_notes
        )
      `)
      .order("created_at", { ascending: false })
      .limit(100);

    if (errWithReason) {
      // 2. Resilient fallback: If cancellation_reason column is not yet applied in Supabase
      const { data: baseOrders, error: baseError } = await adminClient
        .from("orders")
        .select(`
          id,
          order_number,
          customer_name,
          order_notes,
          total_amount_inr,
          status,
          created_at,
          updated_at,
          tables!inner(
            id,
            table_number,
            display_name
          ),
          order_items(
            id,
            item_name,
            unit_price_inr,
            quantity,
            customization_notes
          )
        `)
        .order("created_at", { ascending: false })
        .limit(100);

      if (baseError) {
        console.error("[StaffOrdersAPI:GET] Query error:", baseError);
        return NextResponse.json({ error: "Failed to fetch orders" }, { status: 500 });
      }

      const safeOrders = (baseOrders || []).map((o) => ({
        ...o,
        cancellation_reason: null,
      }));

      return NextResponse.json({ orders: safeOrders });
    }

    return NextResponse.json({ orders: ordersWithReason });
  } catch (err: unknown) {
    console.error("[StaffOrdersAPI:GET] Exception:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
