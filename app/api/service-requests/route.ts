import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { getAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseConfigured } from "@/lib/supabase/client";
import {
  VALID_REQUEST_TYPES,
  type ServiceRequestType,
} from "@/features/service-requests/service-request-lifecycle";

interface CreateServiceRequestBody {
  requestType: ServiceRequestType;
  note?: string;
}

const COOLDOWN_SECONDS = 15;
const MAX_NOTE_LENGTH = 200;

/**
 * GET /api/service-requests
 * Retrieves all service requests for the current customer table session.
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

    // Fetch all service requests for this table_order_session
    const { data: requests, error: requestsError } = await adminClient
      .from("service_requests")
      .select(`
        id,
        table_id,
        table_order_session_id,
        request_type,
        note,
        status,
        created_at,
        acknowledged_at,
        resolved_at,
        updated_at
      `)
      .eq("table_order_session_id", scanSession.table_order_session_id)
      .order("created_at", { ascending: false });

    if (requestsError) {
      // Defensive fallback if migration is pending in remote database
      console.warn("[ServiceRequests:GET] Query error:", requestsError.message);
      return NextResponse.json({ serviceRequests: [] });
    }

    return NextResponse.json({
      serviceRequests: requests || [],
      requests: requests || [],
    });
  } catch (err: unknown) {
    console.error("[ServiceRequests:GET] Exception:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * POST /api/service-requests
 * Creates a service request for the validated customer table session.
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
    const body = (await request.json()) as CreateServiceRequestBody;
    const { requestType, note } = body;

    // 1. Validate requestType
    if (!requestType || !VALID_REQUEST_TYPES.includes(requestType)) {
      return NextResponse.json(
        {
          error: `Invalid request type. Must be one of: ${VALID_REQUEST_TYPES.join(", ")}`,
          code: "INVALID_REQUEST_TYPE",
        },
        { status: 400 }
      );
    }

    // 2. Validate note length
    if (note && note.length > MAX_NOTE_LENGTH) {
      return NextResponse.json(
        {
          error: `Note exceeds maximum length of ${MAX_NOTE_LENGTH} characters.`,
          code: "NOTE_TOO_LONG",
        },
        { status: 400 }
      );
    }

    const sessionHash = crypto.createHash("sha256").update(sessionCookie).digest("hex");
    const adminClient = getAdminClient();

    // 3. Validate customer session & active table status
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
        { error: "Ordering and service requests are closed for this table session." },
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

    // 4. Duplicate Active Request Check (same request_type currently OPEN or ACKNOWLEDGED)
    const { data: activeDuplicates } = await adminClient
      .from("service_requests")
      .select("id, request_type, status, created_at")
      .eq("table_order_session_id", orderSession.id)
      .eq("request_type", requestType)
      .in("status", ["OPEN", "ACKNOWLEDGED"])
      .limit(1);

    if (activeDuplicates && activeDuplicates.length > 0) {
      return NextResponse.json(
        {
          error: "You already have an active request of this type pending.",
          code: "DUPLICATE_ACTIVE_REQUEST",
          activeRequest: activeDuplicates[0],
        },
        { status: 409 }
      );
    }

    // 5. Rate limiting / Cooldown protection (15 seconds between any service requests)
    const { data: recentRequests } = await adminClient
      .from("service_requests")
      .select("id, created_at")
      .eq("table_order_session_id", orderSession.id)
      .order("created_at", { ascending: false })
      .limit(1);

    if (recentRequests && recentRequests.length > 0) {
      const lastCreatedTime = new Date(recentRequests[0].created_at).getTime();
      const elapsedSeconds = Math.floor((Date.now() - lastCreatedTime) / 1000);
      if (elapsedSeconds < COOLDOWN_SECONDS) {
        const remaining = COOLDOWN_SECONDS - elapsedSeconds;
        return NextResponse.json(
          {
            error: `Please wait ${remaining}s before sending another request.`,
            code: "RATE_LIMITED",
            retryAfterSeconds: remaining,
          },
          { status: 429 }
        );
      }
    }

    // 6. Insert new service request
    const payload = {
      table_id: table.id,
      table_order_session_id: orderSession.id,
      customer_scan_session_id: scanSession.id,
      request_type: requestType,
      note: note?.trim() || null,
      status: "OPEN" as const,
    };

    const { data: createdRequest, error: insertError } = await adminClient
      .from("service_requests")
      .insert(payload)
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

    if (insertError || !createdRequest) {
      console.error("[ServiceRequests:POST] Insert error:", insertError);
      return NextResponse.json(
        { error: "Failed to create service request. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        serviceRequest: createdRequest,
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    console.error("[ServiceRequests:POST] Exception:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
