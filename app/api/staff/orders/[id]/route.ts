import { NextRequest, NextResponse } from "next/server";
import { requireStaffApi } from "@/lib/auth/staff";
import { getAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

export type KitchenOrderStatus = "PENDING" | "NEW" | "PREPARING" | "DELIVERED" | "CANCELLED";

export const VALID_KITCHEN_STATUSES: readonly KitchenOrderStatus[] = [
  "PENDING",
  "NEW",
  "PREPARING",
  "DELIVERED",
  "CANCELLED",
] as const;

/**
 * Enforced kitchen order lifecycle transitions:
 * NEW / PENDING -> PREPARING, CANCELLED
 * PREPARING     -> DELIVERED, CANCELLED
 * DELIVERED     -> none (terminal)
 * CANCELLED     -> none (terminal)
 */
export const ALLOWED_STATUS_TRANSITIONS: Record<KitchenOrderStatus, KitchenOrderStatus[]> = {
  PENDING: ["PREPARING", "CANCELLED"],
  NEW: ["PREPARING", "CANCELLED"],
  PREPARING: ["DELIVERED", "CANCELLED"],
  DELIVERED: [],
  CANCELLED: [],
};

/**
 * PATCH /api/staff/orders/[id]
 * Updates order status from kitchen display with:
 * 1. Staff authorization verification
 * 2. Status lifecycle validation (rejecting illegal transitions)
 * 3. Atomic optimistic concurrency guard (detecting conflicting staff updates)
 * 4. Resilient fallback if migration columns are pending
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireStaffApi();
  if (!auth.authorized) {
    return auth.response;
  }

  const { id: orderId } = await params;
  if (!orderId) {
    return NextResponse.json({ error: "Missing order ID" }, { status: 400 });
  }

  try {
    const body = (await request.json()) as { status?: string; reason?: string };
    const { status, reason } = body;

    if (!status || !VALID_KITCHEN_STATUSES.includes(status as KitchenOrderStatus)) {
      return NextResponse.json(
        {
          error: `Invalid status '${status}'. Must be one of: ${VALID_KITCHEN_STATUSES.join(", ")}`,
          code: "INVALID_STATUS",
        },
        { status: 400 }
      );
    }

    const adminClient = getAdminClient();

    // 1. Fetch current status of the order to validate transition
    const { data: currentOrder, error: fetchError } = await adminClient
      .from("orders")
      .select("id, status, order_number, updated_at")
      .eq("id", orderId)
      .single();

    if (fetchError || !currentOrder) {
      return NextResponse.json({ error: "Order not found", code: "NOT_FOUND" }, { status: 404 });
    }

    const currentStatus = currentOrder.status as KitchenOrderStatus;

    // 2. Idempotent check: If already in target status, return 200 without conflict
    if (currentStatus === status) {
      return NextResponse.json({
        success: true,
        order: currentOrder,
        message: `Order is already in '${status}' status.`,
      });
    }

    // 3. Enforce lifecycle transition rules
    const allowedTargets = ALLOWED_STATUS_TRANSITIONS[currentStatus] || [];
    if (!allowedTargets.includes(status as KitchenOrderStatus)) {
      return NextResponse.json(
        {
          error: `Cannot transition order from '${currentStatus}' to '${status}'.`,
          code: "INVALID_STATUS_TRANSITION",
          currentStatus,
          targetStatus: status,
          allowedTransitions: allowedTargets,
        },
        { status: 409 }
      );
    }

    // 4. Atomic update with optimistic concurrency guard (WHERE id = orderId AND status = currentStatus)
    const updatePayload: Database["public"]["Tables"]["orders"]["Update"] = {
      status,
      updated_at: new Date().toISOString(),
    };
    if (status === "CANCELLED" && typeof reason === "string" && reason.trim()) {
      updatePayload.cancellation_reason = reason.trim();
    }

    let updatedOrder: { id: string; status: string; order_number?: string | null; updated_at?: string; cancellation_reason?: string | null } | null = null;

    const { data: attemptedOrder, error: updateError } = await adminClient
      .from("orders")
      .update(updatePayload)
      .eq("id", orderId)
      .eq("status", currentStatus) // Compare-And-Swap check
      .select("id, status, order_number, updated_at")
      .maybeSingle();

    if (updateError) {
      // If cancellation_reason column is not in DB yet, fallback without it
      const basePayload = {
        status,
        updated_at: new Date().toISOString(),
      };
      const { data: baseOrder, error: baseUpdateError } = await adminClient
        .from("orders")
        .update(basePayload)
        .eq("id", orderId)
        .eq("status", currentStatus)
        .select("id, status, order_number, updated_at")
        .maybeSingle();

      if (baseUpdateError) {
        console.error("[StaffOrdersAPI:PATCH] Update error:", baseUpdateError);
        return NextResponse.json(
          { error: "Failed to update order status", code: "DATABASE_ERROR" },
          { status: 500 }
        );
      }
      updatedOrder = baseOrder;
    } else {
      updatedOrder = attemptedOrder;
    }

    // 5. If 0 rows updated, a concurrent modification occurred
    if (!updatedOrder) {
      const { data: latestOrder } = await adminClient
        .from("orders")
        .select("id, status, order_number, updated_at")
        .eq("id", orderId)
        .single();

      return NextResponse.json(
        {
          error: "This order was updated by another staff member. The latest status has been loaded.",
          code: "CONCURRENCY_CONFLICT",
          currentStatus: latestOrder?.status,
          order: latestOrder,
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      order: updatedOrder,
    });
  } catch (err: unknown) {
    console.error("[StaffOrdersAPI:PATCH] Exception:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * GET /api/staff/orders/[id]
 * Returns full details of a specific order including items and table info.
 * Restricted to authenticated staff and administrators.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireStaffApi();
  if (!auth.authorized) {
    return auth.response;
  }

  const { id: orderId } = await params;
  if (!orderId) {
    return NextResponse.json({ error: "Missing order ID" }, { status: 400 });
  }

  try {
    const adminClient = getAdminClient();

    // 1. Try complete query with cancellation_reason
    const { data: orderWithReason, error: errWithReason } = await adminClient
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
      .eq("id", orderId)
      .single();

    if (errWithReason) {
      // 2. Resilient fallback: base query
      const { data: baseOrder, error: baseErr } = await adminClient
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
        .eq("id", orderId)
        .single();

      if (baseErr || !baseOrder) {
        return NextResponse.json({ error: "Order not found" }, { status: 404 });
      }

      return NextResponse.json({ order: { ...baseOrder, cancellation_reason: null } });
    }

    return NextResponse.json({ order: orderWithReason });
  } catch (err: unknown) {
    console.error("[StaffOrdersAPI:GET_BY_ID] Exception:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
