import type { ReactNode } from "react";
import type { Metadata } from "next";
import "./customer.css";

export const metadata: Metadata = {
  title: "Courista | Order at Your Table",
  description: "Explore the Courista menu and follow your table order.",
  icons: { icon: "/courista/favicon.svg", shortcut: "/courista/favicon.svg" },
};

export default function TableLayout({ children }: { children: ReactNode }) {
  return <div className="courista">{children}</div>;
}
