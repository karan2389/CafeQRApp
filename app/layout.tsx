import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";
import { DemoWebMcp } from "@/app/components/demo-webmcp";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ember & Oak Cafe Demo",
  description: "Interactive QR ordering and kitchen dashboard demo.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
        <DemoWebMcp />
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
