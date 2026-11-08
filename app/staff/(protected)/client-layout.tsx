"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Moon, Sun, Loader2 } from "lucide-react";
import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import "./kitchen-dashboard.css";

interface StaffClientLayoutProps {
  children: React.ReactNode;
}

const preferenceKey = "courista-kitchen-theme";

export default function StaffClientLayout({ children }: StaffClientLayoutProps) {
  const router = useRouter();
  const { signOut } = useAuthActions();
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const viewer = useQuery(api.users.viewer);

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

  // Authentication and role enforcement guard
  useEffect(() => {
    // 1. Wait while auth state is initializing from storage
    if (authLoading) return;

    // 2. If definitely unauthenticated, redirect to login
    if (!isAuthenticated) {
      router.replace("/staff/login?error=unauthorized");
      return;
    }

    // 3. If authenticated, wait until viewer profile is fetched from Convex
    if (!viewer) return;

    // 4. Role check: only kitchen_staff and admin are permitted
    if (viewer.role !== "kitchen_staff" && viewer.role !== "admin") {
      router.replace("/staff/login?error=forbidden");
    }
  }, [authLoading, isAuthenticated, viewer, router]);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try {
      window.localStorage.setItem(preferenceKey, next);
    } catch {
      // Keep the visible choice.
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch {
      // Preserve existing sign-out behavior
    }
    router.push("/staff/login");
    router.refresh();
  };

  // While checking auth status or loading viewer profile, display clean loader
  if (authLoading || !isAuthenticated || !viewer) {
    return (
      <div className="kitchen-shell" data-kitchen-theme={theme}>
        <div className="min-h-screen flex items-center justify-center text-amber-500">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      </div>
    );
  }

  // If unauthorized, do not render children
  if (viewer.role !== "kitchen_staff" && viewer.role !== "admin") {
    return null;
  }

  const fullName = viewer.name || (viewer.role === "admin" ? "Administrator" : "Kitchen Staff");
  const userEmail = viewer.email || "staff@courista.cafe";
  const roleLabel = viewer.role === "admin" ? "Manager" : "Kitchen staff";

  return (
    <div className="kitchen-shell" data-kitchen-theme={theme}>
      <header className="kitchen-header">
        <div className="kitchen-brand" aria-label="Courista Kitchen">
          <span className="kitchen-monogram">C</span>
          <span>
            <strong>Courista</strong>
            <small>Kitchen dashboard</small>
          </span>
        </div>
        <div className="kitchen-header-actions">
          <span className="kitchen-account" title={userEmail}>
            <strong>{fullName}</strong>
            <small>{roleLabel}</small>
          </span>
          <button
            className="kitchen-utility"
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
          </button>
          <button className="kitchen-utility" type="button" onClick={handleSignOut}>
            <LogOut size={17} />
            <span>Sign out</span>
          </button>
        </div>
      </header>
      <main className="kitchen-main">{children}</main>
    </div>
  );
}
