import { NextRequest, NextResponse } from "next/server";
import { requireStaffApi } from "@/lib/auth/staff";
import { getAdminClient } from "@/lib/supabase/admin";
import type { ServiceRequestStatus } from "@/types/service-requests";

/**
 * GET /api/staff/service-requests
 * Retrieves service requests for the kitchen & staff dashboard.
 * Requires authenticated staff or admin.
 * Active requests are sorted FIFO (oldest first).
 */
export async function GET(request: NextRequest) {
  const auth = await requireStaffApi();
  if (!auth.authorized) {
    return auth.response;
  }

  const { searchParams } = new URL(request.url);
  const statusFilter = searchParams.get("status");

  try {
    const adminClient = getAdminClient();

    let query = adminClient
      .from("service_requests")
      .select(`
        id,
        table_id,
        table_order_session_id,
        customer_scan_session_id,
        request_type,
        note,
        status,
        acknowledged_at,
        resolved_at,
        acknowledged_by,
        resolved_by,
        created_at,
        updated_at,
        tables!inner(
          id,
          table_number,
          display_name
        )
      `);

    if (statusFilter === "ACTIVE") {
      query = query.in("status", ["OPEN", "ACKNOWLEDGED"]).order("created_at", { ascending: true });
    } else if (statusFilter && statusFilter !== "ALL") {
      query = query.eq("status", statusFilter as ServiceRequestStatus).order("created_at", { ascending: false });
    } else {
      query = query.order("created_at", { ascending: false });
    }

    const { data: serviceRequests, error } = await query.limit(100);

    if (error) {
      console.warn("[StaffServiceRequests:GET] Query error:", error.message);
      return NextResponse.json({ serviceRequests: [] });
    }

    return NextResponse.json({
      serviceRequests: serviceRequests || [],
      requests: serviceRequests || [],
    });
  } catch (err: unknown) {
    console.error("[StaffServiceRequests:GET] Exception:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
