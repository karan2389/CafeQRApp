import ClientLayout from "./client-layout";

export default function ProtectedAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ClientLayout>{children}</ClientLayout>;
}
