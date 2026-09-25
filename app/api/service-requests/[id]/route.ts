import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { getAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseConfigured } from "@/lib/supabase/client";
import { canCustomerTransition } from "@/features/service-requests/service-request-lifecycle";
import type { ServiceRequestStatus } from "@/types/service-requests";

/**
 * PATCH /api/service-requests/[id]
 * Allows customer to cancel their own OPEN service request.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id: requestId } = await params;
  if (!requestId) {
    return NextResponse.json({ error: "Missing request ID" }, { status: 400 });
  }

  try {
    const sessionHash = crypto.createHash("sha256").update(sessionCookie).digest("hex");
    const adminClient = getAdminClient();

    // Verify session
    const { data: scanSession, error: sessionError } = await adminClient
      .from("customer_scan_sessions")
      .select("id, table_order_session_id, expires_at")
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

    const body = (await request.json()) as { status?: string };
    const targetStatus = body.status as ServiceRequestStatus;

    if (targetStatus !== "CANCELLED") {
      return NextResponse.json(
        {
          error: "Customers are only permitted to cancel pending requests.",
          code: "UNAUTHORIZED_TRANSITION",
        },
        { status: 403 }
      );
    }

    // Fetch existing request scoped to current session
    const { data: existingRequest, error: fetchError } = await adminClient
      .from("service_requests")
      .select("id, status, table_order_session_id")
      .eq("id", requestId)
      .eq("table_order_session_id", scanSession.table_order_session_id)
      .maybeSingle();

    if (fetchError || !existingRequest) {
      return NextResponse.json(
        { error: "Service request not found or does not belong to your session", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    const currentStatus = existingRequest.status as ServiceRequestStatus;

    // Idempotent return if already CANCELLED
    if (currentStatus === "CANCELLED") {
      return NextResponse.json({
        success: true,
        serviceRequest: existingRequest,
        message: "Request is already cancelled.",
      });
    }

    if (!canCustomerTransition(currentStatus, "CANCELLED")) {
      return NextResponse.json(
        {
          error: `Cannot cancel request in '${currentStatus}' status. Staff is already attending to it.`,
          code: "INVALID_STATUS_TRANSITION",
          currentStatus,
        },
        { status: 400 }
      );
    }

    // Update to CANCELLED
    const { data: updatedRequest, error: updateError } = await adminClient
      .from("service_requests")
      .update({ status: "CANCELLED" })
      .eq("id", requestId)
      .select(`
        id,
        table_id,
        table_order_session_id,
        request_type,
        note,
        status,
        created_at,
        updated_at
      `)
      .single();

    if (updateError || !updatedRequest) {
      console.error("[ServiceRequests:PATCH] Update error:", updateError);
      return NextResponse.json({ error: "Failed to cancel request" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      serviceRequest: updatedRequest,
    });
  } catch (err: unknown) {
    console.error("[ServiceRequests:PATCH] Exception:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
