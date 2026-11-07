import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { CustomerPageClient } from "@/components/customer/customer-page-client";

export default async function TablePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { slug } = await params;
  const { token } = await searchParams;

  // If a raw QR token is provided in the query string, redirect through /qr to establish session
  if (token) {
    redirect(`/qr?slug=${encodeURIComponent(slug)}&token=${encodeURIComponent(token)}`);
  }

  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("cafe_customer_session")?.value;
  const scanSessionId = cookieStore.get("cafe_customer_scan_id")?.value;
  const rawReadCapabilityToken = cookieStore.get("cafe_customer_read_token")?.value;

  if (!sessionCookie) {
    redirect("/table-invalid?reason=scan_required");
  }

  return (
    <CustomerPageClient
      slug={slug}
      customerScanSessionId={scanSessionId}
      rawReadCapabilityToken={rawReadCapabilityToken}
    />
  );
}
