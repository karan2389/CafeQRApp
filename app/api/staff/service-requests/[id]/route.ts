import { NextRequest, NextResponse } from "next/server";
import { requireStaffApi } from "@/lib/auth/staff";
import { getAdminClient } from "@/lib/supabase/admin";
import {
  canStaffTransition,
  VALID_SERVICE_STATUSES,
  ALLOWED_STAFF_TRANSITIONS,
} from "@/features/service-requests/service-request-lifecycle";
import type { ServiceRequestStatus } from "@/types/service-requests";

/**
 * PATCH /api/staff/service-requests/[id]
 * Updates service request status (ACKNOWLEDGED, RESOLVED, CANCELLED).
 * Protected by staff auth, lifecycle transition rules, and optimistic CAS concurrency guard.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireStaffApi();
  if (!auth.authorized) {
    return auth.response;
  }

  const { id: requestId } = await params;
  if (!requestId) {
    return NextResponse.json({ error: "Missing service request ID" }, { status: 400 });
  }

  try {
    const body = (await request.json()) as { status?: string };
    const { status: targetStatus } = body;

    if (!targetStatus || !VALID_SERVICE_STATUSES.includes(targetStatus as ServiceRequestStatus)) {
      return NextResponse.json(
        {
          error: `Invalid status '${targetStatus}'. Must be one of: ${VALID_SERVICE_STATUSES.join(", ")}`,
          code: "INVALID_STATUS",
        },
        { status: 400 }
      );
    }

    const adminClient = getAdminClient();

    // 1. Fetch current status of the service request
    const { data: currentReq, error: fetchError } = await adminClient
      .from("service_requests")
      .select("id, status, acknowledged_at, updated_at")
      .eq("id", requestId)
      .maybeSingle();

    if (fetchError || !currentReq) {
      return NextResponse.json(
        { error: "Service request not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    const currentStatus = currentReq.status as ServiceRequestStatus;

    // 2. Idempotent check
    if (currentStatus === targetStatus) {
      return NextResponse.json({
        success: true,
        serviceRequest: currentReq,
        message: `Service request is already '${targetStatus}'.`,
      });
    }

    // 3. Enforce lifecycle transition rules
    if (!canStaffTransition(currentStatus, targetStatus as ServiceRequestStatus)) {
      return NextResponse.json(
        {
          error: `Cannot transition request from '${currentStatus}' to '${targetStatus}'.`,
          code: "INVALID_STATUS_TRANSITION",
          currentStatus,
          targetStatus,
          allowedTransitions: ALLOWED_STAFF_TRANSITIONS[currentStatus] || [],
        },
        { status: 400 }
      );
    }

    // 4. Prepare update payload
    const nowIso = new Date().toISOString();
    const updatePayload: {
      status: ServiceRequestStatus;
      acknowledged_at?: string | null;
      acknowledged_by?: string | null;
      resolved_at?: string | null;
      resolved_by?: string | null;
    } = {
      status: targetStatus as ServiceRequestStatus,
    };

    if (targetStatus === "ACKNOWLEDGED") {
      updatePayload.acknowledged_at = nowIso;
      updatePayload.acknowledged_by = auth.staffUser?.id || null;
    } else if (targetStatus === "RESOLVED") {
      updatePayload.resolved_at = nowIso;
      updatePayload.resolved_by = auth.staffUser?.id || null;
      if (!currentReq.acknowledged_at) {
        updatePayload.acknowledged_at = nowIso;
        updatePayload.acknowledged_by = auth.staffUser?.id || null;
      }
    }

    // 5. Atomic Optimistic CAS Concurrency Guard
    const { data: updatedReq, error: updateError } = await adminClient
      .from("service_requests")
      .update(updatePayload)
      .eq("id", requestId)
      .eq("status", currentStatus) // Must match the read state
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
      `)
      .maybeSingle();

    if (updateError) {
      console.error("[StaffServiceRequests:PATCH] Update error:", updateError);
      return NextResponse.json({ error: "Failed to update service request" }, { status: 500 });
    }

    // If 0 rows updated, another staff member changed it concurrently
    if (!updatedReq) {
      const { data: refreshedReq } = await adminClient
        .from("service_requests")
        .select(`
          id,
          table_id,
          status,
          updated_at,
          tables!inner(id, table_number, display_name)
        `)
        .eq("id", requestId)
        .maybeSingle();

      return NextResponse.json(
        {
          error: "Conflict: This request was updated by another staff member.",
          code: "CONCURRENCY_CONFLICT",
          currentStatus: refreshedReq?.status,
          serviceRequest: refreshedReq,
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      serviceRequest: updatedReq,
    });
  } catch (err: unknown) {
    console.error("[StaffServiceRequests:PATCH] Exception:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
