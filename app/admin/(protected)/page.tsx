"use client";

import Link from "next/link";
import {
  UtensilsCrossed,
  FolderTree,
  QrCode,
  Layers,
  Plus,
  ArrowUpRight,
  Loader2,
} from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";

export default function AdminDashboardPage() {
  const menuItems = useQuery(api.menu.getAdminMenuItems);
  const categories = useQuery(api.categories.getAdminCategories);
  const tables = useQuery(api.tables.listTables);
  const activeSessions = useQuery(api.sessions.getActiveTableSessions);

  const loading =
    menuItems === undefined ||
    categories === undefined ||
    tables === undefined ||
    activeSessions === undefined;

  const stats = {
    menuItemsCount: menuItems?.length ?? 0,
    availableItemsCount: menuItems?.filter((i) => i.isAvailable).length ?? 0,
    categoriesCount: categories?.length ?? 0,
    tablesCount: tables?.length ?? 0,
    activeTablesCount: tables?.filter((t) => t.isActive).length ?? 0,
    activeSessionsCount: activeSessions?.length ?? 0,
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">Management Overview</h1>
          <p className="text-stone-400 text-sm mt-1">Live restaurant operational metrics and quick management controls</p>
        </div>
        <div className="flex items-center gap-3">
          <Button asChild size="sm" className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold shadow-md">
            <Link href="/admin/menu">
              <Plus className="w-4 h-4 mr-1.5" />
              Add Menu Item
            </Link>
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center text-stone-400 space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
          <p className="text-sm">Loading operational metrics from Convex...</p>
        </div>
      ) : (
        <>
          {/* KPI Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Menu Items Card */}
            <div className="bg-stone-900/90 border border-stone-800 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between text-stone-400">
                <span className="text-xs font-semibold uppercase tracking-wider">Menu Items</span>
                <UtensilsCrossed className="w-4 h-4 text-amber-400" />
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-3xl font-bold text-white">{stats.menuItemsCount}</span>
                <span className="text-xs text-stone-400">{stats.availableItemsCount} in stock</span>
              </div>
              <div className="pt-2 border-t border-stone-800/80 flex items-center justify-between text-xs">
                <Link href="/admin/menu" className="text-amber-400 hover:text-amber-300 flex items-center gap-1 font-medium">
                  Manage menu <ArrowUpRight className="w-3 h-3" />
                </Link>
              </div>
            </div>

            {/* Categories Card */}
            <div className="bg-stone-900/90 border border-stone-800 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between text-stone-400">
                <span className="text-xs font-semibold uppercase tracking-wider">Categories</span>
                <FolderTree className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-3xl font-bold text-white">{stats.categoriesCount}</span>
                <span className="text-xs text-stone-400">Active groups</span>
              </div>
              <div className="pt-2 border-t border-stone-800/80 flex items-center justify-between text-xs">
                <Link href="/admin/categories" className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-medium">
                  Manage categories <ArrowUpRight className="w-3 h-3" />
                </Link>
              </div>
            </div>

            {/* Tables Card */}
            <div className="bg-stone-900/90 border border-stone-800 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between text-stone-400">
                <span className="text-xs font-semibold uppercase tracking-wider">Dining Tables</span>
                <QrCode className="w-4 h-4 text-sky-400" />
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-3xl font-bold text-white">{stats.tablesCount}</span>
                <span className="text-xs text-stone-400">{stats.activeTablesCount} active</span>
              </div>
              <div className="pt-2 border-t border-stone-800/80 flex items-center justify-between text-xs">
                <Link href="/admin/tables" className="text-sky-400 hover:text-sky-300 flex items-center gap-1 font-medium">
                  Tables & QR <ArrowUpRight className="w-3 h-3" />
                </Link>
              </div>
            </div>

            {/* Active Order Sessions Card */}
            <div className="bg-stone-900/90 border border-stone-800 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between text-stone-400">
                <span className="text-xs font-semibold uppercase tracking-wider">Active Table Bills</span>
                <Layers className="w-4 h-4 text-purple-400" />
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-3xl font-bold text-white">{stats.activeSessionsCount}</span>
                <span className="text-xs text-stone-400">Seated dining</span>
              </div>
              <div className="pt-2 border-t border-stone-800/80 flex items-center justify-between text-xs">
                <Link href="/admin/tables" className="text-purple-400 hover:text-purple-300 flex items-center gap-1 font-medium">
                  View table sessions <ArrowUpRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
          </div>

          {/* Quick Navigation Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-stone-900/70 border border-stone-800/80 rounded-2xl p-6 space-y-4 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
                  <UtensilsCrossed className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-semibold text-white">Menu Item Catalog</h3>
                <p className="text-stone-400 text-sm">
                  Create, modify, upload Cloudflare R2 images, and toggle availability in real-time.
                </p>
              </div>
              <Button asChild variant="outline" className="w-full border-stone-700 hover:bg-stone-800 text-stone-200">
                <Link href="/admin/menu">Open Menu Catalog</Link>
              </Button>
            </div>

            <div className="bg-stone-900/70 border border-stone-800/80 rounded-2xl p-6 space-y-4 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                  <FolderTree className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-semibold text-white">Categories & Ordering</h3>
                <p className="text-stone-400 text-sm">
                  Organize categories, adjust customer display order, and configure branch visibility.
                </p>
              </div>
              <Button asChild variant="outline" className="w-full border-stone-700 hover:bg-stone-800 text-stone-200">
                <Link href="/admin/categories">Configure Categories</Link>
              </Button>
            </div>

            <div className="bg-stone-900/70 border border-stone-800/80 rounded-2xl p-6 space-y-4 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center">
                  <QrCode className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-semibold text-white">Table QR Codes</h3>
                <p className="text-stone-400 text-sm">
                  Manage dining tables, regenerate secure QR tokens, and print ready-to-scan codes.
                </p>
              </div>
              <Button asChild variant="outline" className="w-full border-stone-700 hover:bg-stone-800 text-stone-200">
                <Link href="/admin/tables">View Tables & QR</Link>
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
