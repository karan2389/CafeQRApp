import { Clock } from "lucide-react";
import { verifyStaffSession } from "@/lib/auth/staff";
import { KitchenDashboardClient } from "@/components/staff/kitchen-dashboard-client";

export const metadata = {
  title: "Kitchen Dashboard | Ember & Oak",
  description: "Ember & Oak Cafe Staff & Kitchen Order Management",
};

export default async function StaffDashboardPage() {
  const result = await verifyStaffSession();

  const isStaffAuthenticated = result.status === "authenticated_staff";
  const userRole = isStaffAuthenticated ? result.role : "unknown";
  const userEmail = isStaffAuthenticated ? result.user.email : "";

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-stone-900 to-stone-900/60 border border-stone-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-4 -translate-y-4 w-48 h-48 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse mr-1.5" />
                Live Staff Session
              </span>
              <span className="text-stone-400 text-xs">• Kitchen Display System</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Kitchen Operations Dashboard
            </h1>
            <p className="text-sm text-stone-400">
              Authenticated as <span className="text-amber-400 font-medium">{userEmail}</span> ({userRole === "admin" ? "Cafe Manager" : "Kitchen Staff"}).
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center bg-stone-950/60 border border-stone-800/80 px-3.5 py-2 rounded-xl text-xs text-stone-400">
            <Clock className="w-4 h-4 text-amber-500" />
            <span>Live Kitchen Queue</span>
          </div>
        </div>
      </div>

      {/* Main Interactive Order Queue */}
      <KitchenDashboardClient />
    </div>
  );
}
