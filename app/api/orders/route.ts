import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { getAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseConfigured } from "@/lib/supabase/client";

interface OrderRequestItem {
  menuItemId: string;
  quantity: number;
  customization?: string;
}

interface CreateOrderPayload {
  items: OrderRequestItem[];
  customerName?: string;
  kitchenNote?: string;
}

/**
 * GET /api/orders
 * Retrieves all orders for the current customer table session.
 * Requires valid cafe_customer_session cookie.
 */
export async function GET(request: NextRequest) {
  if (!hasSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const sessionCookie = request.cookies.get("cafe_customer_session")?.value;
  if (!sessionCookie) {
    return NextResponse.json(
      { error: "Unauthorized: Missing customer session" },
      { status: 401 }
    );
  }

  try {
    const sessionHash = crypto.createHash("sha256").update(sessionCookie).digest("hex");
    const adminClient = getAdminClient();

    // Verify session and fetch table order session status
    const { data: scanSession, error: sessionError } = await adminClient
      .from("customer_scan_sessions")
      .select(`
        id,
        table_order_session_id,
        expires_at,
        table_order_sessions!inner(
          id,
          status
        )
      `)
      .eq("session_token_hash", sessionHash)
      .maybeSingle();

    if (sessionError || !scanSession) {
      return NextResponse.json(
        { error: "Invalid or expired session" },
        { status: 403 }
      );
    }

    if (new Date(scanSession.expires_at) < new Date()) {
      return NextResponse.json(
        { error: "Session expired. Please scan table QR again." },
        { status: 403 }
      );
    }

    // Fetch all orders for this table_order_session (newest first for customer display)
    // 1. Attempt query with cancellation_reason
    const { data: ordersWithReason, error: ordersError } = await adminClient
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
        order_items(
          id,
          menu_item_id,
          item_name,
          unit_price_inr,
          quantity,
          customization_notes
        )
      `)
      .eq("table_order_session_id", scanSession.table_order_session_id)
      .order("created_at", { ascending: false });

    let orders = ordersWithReason;

    if (ordersError) {
      // 2. Resilient fallback: If cancellation_reason column is not yet applied in remote Supabase
      console.warn("[OrdersAPI:GET] Primary query failed, falling back to base schema:", ordersError.message);
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
          order_items(
            id,
            menu_item_id,
            item_name,
            unit_price_inr,
            quantity,
            customization_notes
          )
        `)
        .eq("table_order_session_id", scanSession.table_order_session_id)
        .order("created_at", { ascending: false });

      if (baseError) {
        console.error("[OrdersAPI:GET] Query error:", baseError);
        return NextResponse.json({ error: "Failed to fetch orders" }, { status: 500 });
      }

      orders = (baseOrders || []).map((o) => ({
        ...o,
        cancellation_reason: null,
      }));
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sessionStatus = (scanSession?.table_order_sessions as any)?.status || "ACTIVE";

    return NextResponse.json({
      orders: orders || [],
      session_status: sessionStatus,
      is_session_closed: sessionStatus === "CLOSED",
    });
  } catch (err: unknown) {
    console.error("[OrdersAPI:GET] Exception:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * POST /api/orders
 * Creates an order for the validated customer session.
 * Server verifies active session, checks menu items in database,
 * recalculates all prices/totals server-side, and records immutable snapshots.
 */
export async function POST(request: NextRequest) {
  if (!hasSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const sessionCookie = request.cookies.get("cafe_customer_session")?.value;
  if (!sessionCookie) {
    return NextResponse.json(
      { error: "Unauthorized: Missing customer session cookie. Please scan table QR." },
      { status: 401 }
    );
  }

  try {
    const body = (await request.json()) as CreateOrderPayload;
    const { items, customerName, kitchenNote } = body;

    // 1. Validate items array
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "Order must contain at least one item." },
        { status: 400 }
      );
    }

    if (items.length > 50) {
      return NextResponse.json(
        { error: "Order item limit exceeded (maximum 50 items)." },
        { status: 400 }
      );
    }

    // Validate quantities and item IDs
    for (const item of items) {
      if (!item.menuItemId || typeof item.menuItemId !== "string") {
        return NextResponse.json({ error: "Invalid menu item identifier." }, { status: 400 });
      }
      if (
        typeof item.quantity !== "number" ||
        !Number.isInteger(item.quantity) ||
        item.quantity <= 0 ||
        item.quantity > 50
      ) {
        return NextResponse.json(
          { error: "Invalid item quantity. Must be an integer between 1 and 50." },
          { status: 400 }
        );
      }
    }

    const sessionHash = crypto.createHash("sha256").update(sessionCookie).digest("hex");
    const adminClient = getAdminClient();

    // 2. Validate session and active table status
    const { data: scanSession, error: sessionError } = await adminClient
      .from("customer_scan_sessions")
      .select(`
        id,
        table_order_session_id,
        expires_at,
        table_order_sessions!inner(
          id,
          status,
          table_id,
          tables!inner(
            id,
            table_number,
            is_active
          )
        )
      `)
      .eq("session_token_hash", sessionHash)
      .maybeSingle();

    if (sessionError || !scanSession) {
      return NextResponse.json(
        { error: "Invalid or expired session. Please scan the QR code again." },
        { status: 403 }
      );
    }

    if (new Date(scanSession.expires_at) < new Date()) {
      return NextResponse.json(
        { error: "Your session has expired. Please re-scan table QR." },
        { status: 403 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orderSession = scanSession.table_order_sessions as any;
    if (orderSession.status !== "ACTIVE") {
      return NextResponse.json(
        {
          error: "SESSION_CLOSED",
          message: "This table session has ended. Please scan the table QR code again to start a new session.",
        },
        { status: 403 }
      );
    }

    const table = orderSession.tables;
    if (!table.is_active) {
      return NextResponse.json(
        { error: "This table is currently inactive." },
        { status: 403 }
      );
    }

    // 3. Fetch menu items from database to compute server-side prices
    const uniqueItemIds = Array.from(new Set(items.map((i) => i.menuItemId)));
    const { data: dbMenuItems, error: menuError } = await adminClient
      .from("menu_items")
      .select("id, name, price, is_available")
      .in("id", uniqueItemIds);

    if (menuError || !dbMenuItems) {
      console.error("[OrdersAPI:POST] Menu items query error:", menuError);
      return NextResponse.json({ error: "Failed to verify menu items." }, { status: 500 });
    }

    const menuMap = new Map(dbMenuItems.map((item) => [item.id, item]));

    for (const item of items) {
      const dbItem = menuMap.get(item.menuItemId);
      if (!dbItem) {
        return NextResponse.json(
          { error: "One or more selected menu items do not exist." },
          { status: 400 }
        );
      }
      if (!dbItem.is_available) {
        return NextResponse.json(
          { error: `"${dbItem.name}" is currently unavailable.` },
          { status: 400 }
        );
      }
    }

    // 4. Calculate prices and line totals strictly on server
    let calculatedTotal = 0;
    const resolvedItems = items.map((item) => {
      const dbItem = menuMap.get(item.menuItemId)!;
      const unitPrice = Number(dbItem.price);
      const lineTotal = Math.round(unitPrice * item.quantity * 100) / 100;
      calculatedTotal += lineTotal;
      return {
        menuItemId: dbItem.id,
        name: dbItem.name,
        unitPrice,
        quantity: item.quantity,
        lineTotal,
        customization: item.customization?.trim() || null,
      };
    });

    calculatedTotal = Math.round(calculatedTotal * 100) / 100;

    // Generate human-readable ticket number (e.g. #4821)
    const orderNumber = `#${String(Date.now()).slice(-4)}`;

    // 5. Insert order record
    let orderRecord: { id: string; status: string; created_at: string };

    const fullOrderPayload = {
      table_order_session_id: orderSession.id,
      table_id: table.id,
      customer_scan_session_id: scanSession.id,
      status: "PENDING",
      total_amount_inr: calculatedTotal,
      customer_name: customerName?.trim() || null,
      order_notes: kitchenNote?.trim() || null,
      order_number: orderNumber,
    };

    const { data: createdOrder, error: orderInsertError } = await adminClient
      .from("orders")
      .insert(fullOrderPayload)
      .select("id, status, created_at")
      .single();

    if (orderInsertError) {
      // Fallback if migration column is not yet applied
      console.warn("[OrdersAPI:POST] Enhanced insert failed, attempting base insert:", orderInsertError.message);
      const basePayload = {
        table_order_session_id: orderSession.id,
        table_id: table.id,
        customer_scan_session_id: scanSession.id,
        status: "PENDING",
      };
      const { data: baseOrder, error: baseInsertError } = await adminClient
        .from("orders")
        .insert(basePayload)
        .select("id, status, created_at")
        .single();

      if (baseInsertError || !baseOrder) {
        console.error("[OrdersAPI:POST] Order insert error:", baseInsertError);
        return NextResponse.json({ error: "Failed to create order." }, { status: 500 });
      }
      orderRecord = baseOrder;
    } else {
      orderRecord = createdOrder;
    }

    // 6. Insert order items with snapshots
    const orderItemsRows = resolvedItems.map((item) => ({
      order_id: orderRecord.id,
      menu_item_id: item.menuItemId,
      item_name: item.name,
      unit_price_inr: item.unitPrice,
      quantity: item.quantity,
      customization_notes: item.customization,
    }));

    const { error: itemsInsertError } = await adminClient
      .from("order_items")
      .insert(orderItemsRows);

    if (itemsInsertError) {
      console.error("[OrdersAPI:POST] Order items insert error:", itemsInsertError);
      return NextResponse.json({ error: "Failed to record order items." }, { status: 500 });
    }

    // 7. Return safe order confirmation
    return NextResponse.json(
      {
        success: true,
        order: {
          id: orderRecord.id,
          orderNumber,
          tableNumber: table.table_number,
          status: orderRecord.status,
          totalAmountInr: calculatedTotal,
          customerName: customerName?.trim() || null,
          itemCount: resolvedItems.reduce((acc, i) => acc + i.quantity, 0),
          items: resolvedItems.map((i) => ({
            name: i.name,
            quantity: i.quantity,
            unitPriceInr: i.unitPrice,
            lineTotal: i.lineTotal,
            customization: i.customization,
          })),
          createdAt: orderRecord.created_at,
        },
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    console.error("[OrdersAPI:POST] Exception:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
