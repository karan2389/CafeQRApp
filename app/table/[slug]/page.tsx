import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import crypto from "node:crypto";
import { getAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseConfigured } from "@/lib/supabase/client";
import { CustomerPageClient } from "@/components/customer/customer-page-client";

export default async function TablePage({ params }: { params: { slug: string } }) {
  const { slug } = await params;

  if (hasSupabaseConfigured()) {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("cafe_customer_session")?.value;

    if (!sessionCookie) {
      redirect("/table-invalid?reason=scan_required");
    }

    const sessionHash = crypto.createHash("sha256").update(sessionCookie).digest("hex");
    const adminClient = getAdminClient();

    // Verify the session and table binding
    const { data: scanSession, error } = await adminClient
      .from("customer_scan_sessions")
      .select(`
        id,
        expires_at,
        table_order_sessions!inner(
          status,
          tables!inner(
            table_number,
            is_active
          )
        )
      `)
      .eq("session_token_hash", sessionHash)
      .maybeSingle();

    if (error || !scanSession) {
      redirect("/table-invalid?reason=invalid_session");
    }

    const { table_order_sessions } = scanSession;
    if (!table_order_sessions) {
      redirect("/table-invalid?reason=invalid_session");
    }

    const { tables, status } = table_order_sessions as unknown as {
      tables: { table_number: number; is_active: boolean };
      status: string;
    };

    if (new Date(scanSession.expires_at) < new Date()) {
      redirect("/table-invalid?reason=session_expired");
    }

    if (status !== "ACTIVE") {
      redirect("/table-invalid?reason=session_closed");
    }

    if (!tables.is_active) {
      redirect("/table-invalid?reason=table_inactive");
    }

    const expectedSlug = `table-${tables.table_number}`;
    if (slug !== expectedSlug) {
      redirect("/table-invalid?reason=table_mismatch");
    }
  }

  // All checks passed (or running in demo mode without Supabase).
  // Render the interactive client page
  return <CustomerPageClient />;
}
