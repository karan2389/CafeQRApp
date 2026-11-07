import StaffClientLayout from "./client-layout";

export default function ProtectedStaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <StaffClientLayout>{children}</StaffClientLayout>;
}
