import { redirect } from "next/navigation";
import { verifyAdminSession } from "@/lib/auth/admin";
import ClientLayout from "./client-layout";

export default async function ProtectedAdminLayout({ children }: { children: React.ReactNode }) {
  const result = await verifyAdminSession();

  if (result.status !== "authenticated_admin") {
    // If not authenticated or not an admin, redirect to login
    redirect("/admin/login?error=unauthorized");
  }

  return <ClientLayout>{children}</ClientLayout>;
}
