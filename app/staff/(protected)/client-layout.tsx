"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Utensils, LogOut, ShieldCheck, ChefHat } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase/client";

interface StaffClientLayoutProps {
  children: React.ReactNode;
  userEmail: string;
  role: "kitchen_staff" | "admin";
  fullName: string;
}

export default function StaffClientLayout({
  children,
  userEmail,
  role,
  fullName,
}: StaffClientLayoutProps) {
  const router = useRouter();

  const handleSignOut = async () => {
    try {
      const supabase = getSupabaseClient();
      if (supabase) {
        await supabase.auth.signOut();
      }
      await fetch("/api/staff/auth/logout", { method: "POST" });
    } catch {
      // Ignore network errors on logout
    }
    router.push("/staff/login");
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col">
      {/* Top Navigation Bar */}
      <header className="bg-stone-900/90 border-b border-stone-800 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo & Portal Identity */}
          <div className="flex items-center gap-3">
            <Link href="/staff" className="flex items-center gap-3 hover:opacity-90 transition-opacity">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-600 to-amber-400 text-stone-950 flex items-center justify-center font-bold shadow-md shadow-amber-500/20">
                <Utensils className="w-5 h-5 stroke-[2.5]" />
              </div>
              <div>
                <span className="font-bold text-white text-base block leading-tight">Ember & Oak</span>
                <span className="text-xs text-amber-400 font-medium tracking-wide uppercase flex items-center gap-1">
                  <ChefHat className="w-3 h-3" />
                  Kitchen Portal
                </span>
              </div>
            </Link>
          </div>

          {/* User Profile & Actions */}
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex flex-col text-right">
              <span className="text-sm font-semibold text-stone-200">{fullName}</span>
              <div className="flex items-center justify-end gap-1.5 text-xs text-stone-400">
                <span>{userEmail}</span>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 uppercase">
                  {role === "admin" ? "Manager" : "Kitchen"}
                </span>
              </div>
            </div>

            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-stone-400 hover:text-red-400 hover:bg-stone-800/80 transition-colors border border-stone-800"
              title="Sign out of staff portal"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-stone-900 bg-stone-950 py-4 text-center text-xs text-stone-400">
        <div className="flex items-center justify-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>Staff Session Active • Role: {role.toUpperCase()}</span>
        </div>
      </footer>
    </div>
  );
}
