import { redirect } from "next/navigation";
import { verifyStaffSession } from "@/lib/auth/staff";
import StaffClientLayout from "./client-layout";

export default async function ProtectedStaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const result = await verifyStaffSession();

  if (result.status !== "authenticated_staff") {
    // If not authenticated or not staff, redirect to login
    redirect("/staff/login?error=unauthorized");
  }

  return (
    <StaffClientLayout
      userEmail={result.user.email ?? "staff@emberandoak.com"}
      role={result.role}
      fullName={result.staffUser?.full_name ?? (result.role === "admin" ? "Administrator" : "Kitchen Staff")}
    >
      {children}
    </StaffClientLayout>
  );
}
