"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Moon, Sun } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase/client";
import "./kitchen-dashboard.css";

interface StaffClientLayoutProps {
  children: React.ReactNode;
  userEmail: string;
  role: "kitchen_staff" | "admin";
  fullName: string;
}

const preferenceKey = "courista-kitchen-theme";

export default function StaffClientLayout({ children, userEmail, role, fullName }: StaffClientLayoutProps) {
  const router = useRouter();
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    let choice: "dark" | "light" = "dark";
    try {
      const saved = window.localStorage.getItem(preferenceKey);
      if (saved === "dark" || saved === "light") choice = saved;
      else if (window.matchMedia("(prefers-color-scheme: light)").matches) choice = "light";
    } catch {
      // The toggle still works during this visit if browser storage is disabled.
    }
    const frame = window.requestAnimationFrame(() => setTheme(choice));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try { window.localStorage.setItem(preferenceKey, next); } catch { /* Keep the visible choice. */ }
  };

  const handleSignOut = async () => {
    try {
      const supabase = getSupabaseClient();
      if (supabase) await supabase.auth.signOut();
      await fetch("/api/staff/auth/logout", { method: "POST" });
    } catch {
      // Preserve the existing sign-out behavior if the network is unavailable.
    }
    router.push("/staff/login");
    router.refresh();
  };

  return (
    <div className="kitchen-shell" data-kitchen-theme={theme}>
      <header className="kitchen-header">
        <div className="kitchen-brand" aria-label="Courista Kitchen">
          <span className="kitchen-monogram">C</span>
          <span><strong>Courista</strong><small>Kitchen dashboard</small></span>
        </div>
        <div className="kitchen-header-actions">
          <span className="kitchen-account" title={userEmail}>
            <strong>{fullName}</strong><small>{role === "admin" ? "Manager" : "Kitchen staff"}</small>
          </span>
          <button className="kitchen-utility" type="button" onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
          </button>
          <button className="kitchen-utility" type="button" onClick={handleSignOut}>
            <LogOut size={17} /><span>Sign out</span>
          </button>
        </div>
      </header>
      <main className="kitchen-main">{children}</main>
    </div>
  );
}
