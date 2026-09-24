"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Coffee, LayoutDashboard, UtensilsCrossed, FolderTree, QrCode, LogOut, ExternalLink } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase/client";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();



  const navLinks = [
    { label: "Overview", href: "/admin", icon: LayoutDashboard },
    { label: "Menu Items", href: "/admin/menu", icon: UtensilsCrossed },
    { label: "Categories", href: "/admin/categories", icon: FolderTree },
    { label: "Tables & QR", href: "/admin/tables", icon: QrCode },
  ];

  const handleSignOut = async () => {
    try {
      const supabase = getSupabaseClient();
      if (supabase) {
        await supabase.auth.signOut();
      }
      await fetch("/api/admin/auth/logout", { method: "POST" });
    } catch {
      // Ignore network errors on logout
    }
    router.push("/admin/login");
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col md:flex-row">
      {/* Sidebar Navigation */}
      <aside className="w-full md:w-64 bg-stone-900 border-r border-stone-800 flex flex-col justify-between shrink-0">
        <div>
          {/* Logo / Header */}
          <div className="p-6 border-b border-stone-800/80 flex items-center justify-between">
            <Link href="/admin" className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-600 to-amber-400 text-stone-950 flex items-center justify-center font-bold shadow-md shadow-amber-500/20">
                <Coffee className="w-5 h-5 stroke-[2.5]" />
              </div>
              <div>
                <span className="font-bold text-white text-base block leading-tight">Ember & Oak</span>
                <span className="text-xs text-amber-400 font-medium tracking-wide uppercase">Admin Portal</span>
              </div>
            </Link>
          </div>

          {/* Navigation Links */}
          <nav className="p-4 space-y-1">
            {navLinks.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                    isActive
                      ? "bg-amber-500 text-stone-950 shadow-md font-semibold"
                      : "text-stone-400 hover:text-white hover:bg-stone-800/60"
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? "text-stone-950" : "text-stone-400"}`} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Footer controls */}
        <div className="p-4 border-t border-stone-800/80 space-y-2">
          <Link
            href="/"
            target="_blank"
            className="flex items-center justify-between px-4 py-2.5 rounded-xl text-xs font-medium text-stone-400 hover:text-white hover:bg-stone-800 transition-colors"
          >
            <span className="flex items-center gap-2">
              <ExternalLink className="w-3.5 h-3.5" />
              View Customer App
            </span>
            <span className="text-[10px] bg-stone-800 px-2 py-0.5 rounded text-stone-400">Live</span>
          </Link>

          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto min-h-screen bg-stone-950 p-6 md:p-8">
        <div className="max-w-6xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
