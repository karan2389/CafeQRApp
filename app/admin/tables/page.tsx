"use client";

import { useEffect, useState, useCallback } from "react";
import { 
  RefreshCw, 
  Copy, 
  ExternalLink, 
  Check, 
  Loader2, 
  ShieldCheck
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { DbTable } from "@/types/database";

interface TableWithSession extends DbTable {
  activeSessionId?: string | null;
}

export default function AdminTablesPage() {
  const [tables, setTables] = useState<TableWithSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);

  // Modal displaying newly minted token
  const [activeQrModal, setActiveQrModal] = useState<{
    tableNumber: number;
    token: string;
    url: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchTables = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      toast.error("Supabase not configured");
      setLoading(false);
      return;
    }

    try {
      const { data: tableData, error: tableErr } = await supabase
        .from("tables")
        .select("*")
        .order("table_number", { ascending: true });

      if (tableErr) throw tableErr;

      // Also fetch active sessions to display active dining state
      const { data: sessionsData } = await supabase
        .from("table_order_sessions")
        .select("id, table_id")
        .eq("status", "ACTIVE");

      const sessionMap = new Map((sessionsData || []).map((s) => [s.table_id, s.id]));

      const combined: TableWithSession[] = (tableData || []).map((t) => ({
        ...t,
        activeSessionId: sessionMap.get(t.id) || null,
      }));

      setTables(combined);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load tables";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    const timer = window.setTimeout(() => {
      if (isMounted) {
        void fetchTables();
      }
    }, 0);
    return () => {
      isMounted = false;
      window.clearTimeout(timer);
    };
  }, [fetchTables]);

  const toggleTableActive = async (table: TableWithSession) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    try {
      const newStatus = !table.is_active;
      const { error } = await supabase
        .from("tables")
        .update({ is_active: newStatus })
        .eq("id", table.id);

      if (error) throw error;
      setTables((prev) =>
        prev.map((t) => (t.id === table.id ? { ...t, is_active: newStatus } : t))
      );
      toast.success(`Table ${table.table_number} is now ${newStatus ? "active" : "inactive"}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to toggle table status";
      toast.error(msg);
    }
  };

  const regenerateToken = async (table: TableWithSession) => {
    setRegeneratingId(table.id);
    try {
      const res = await fetch("/api/admin/tables/regenerate-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableId: table.id }),
      });

      const data = (await res.json()) as { error?: string; token?: string };
      if (!res.ok || !data.token) {
        throw new Error(data.error || "Failed to regenerate QR token");
      }

      const scanUrl = `${window.location.origin}/qr?token=${data.token}`;
      setActiveQrModal({
        tableNumber: table.table_number,
        token: data.token,
        url: scanUrl,
      });

      toast.success(`New secure QR token generated for Table ${table.table_number}!`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to regenerate token";
      toast.error(msg);
    } finally {
      setRegeneratingId(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Dining Tables & QR Tokens</h1>
          <p className="text-stone-400 text-sm mt-0.5">
            Manage table availability, inspect active dining sessions, and regenerate cryptographic QR tokens
          </p>
        </div>
        <Button
          variant="outline"
          onClick={fetchTables}
          disabled={loading}
          className="border-stone-800 bg-stone-900/60 hover:bg-stone-800 text-stone-300"
        >
          <RefreshCw className={`w-3.5 h-3.5 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh Status
        </Button>
      </div>

      {/* Tables Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full py-20 flex flex-col items-center justify-center text-stone-400 space-y-3">
            <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
            <p className="text-sm">Loading tables from database...</p>
          </div>
        ) : (
          tables.map((table) => {
            const isRegenerating = regeneratingId === table.id;

            return (
              <div
                key={table.id}
                className={`bg-stone-900/90 border rounded-2xl p-5 space-y-4 transition-all ${
                  table.is_active
                    ? "border-stone-800 hover:border-stone-700"
                    : "border-stone-850 opacity-60"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <span className="text-xs font-semibold uppercase tracking-wider text-stone-400">
                      Dining Table
                    </span>
                    <h2 className="text-2xl font-bold text-white">Table {table.table_number}</h2>
                    <p className="text-xs text-stone-400 font-medium">
                      {table.display_name || "Standard Table"}
                    </p>
                  </div>

                  <div className="flex flex-col items-end gap-1.5">
                    <button
                      onClick={() => toggleTableActive(table)}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                        table.is_active
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20"
                          : "bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20"
                      }`}
                    >
                      {table.is_active ? "Active" : "Disabled"}
                    </button>

                    {table.activeSessionId ? (
                      <span className="text-[11px] bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded-full font-medium">
                        Bill Active
                      </span>
                    ) : (
                      <span className="text-[11px] text-stone-500">Vacant</span>
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t border-stone-800/80 flex items-center justify-between gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isRegenerating}
                    onClick={() => regenerateToken(table)}
                    className="border-stone-700 text-stone-200 hover:bg-stone-800 text-xs flex-1"
                  >
                    {isRegenerating ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 mr-1.5 text-amber-400" />
                        Regenerate QR Token
                      </>
                    )}
                  </Button>

                  <Button
                    asChild
                    variant="ghost"
                    size="sm"
                    className="text-stone-400 hover:text-white hover:bg-stone-800 text-xs"
                  >
                    <a href={`/table/table-${table.table_number}`} target="_blank">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Newly Regenerated QR Modal */}
      {activeQrModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-800 rounded-3xl max-w-md w-full p-6 sm:p-8 space-y-6 shadow-2xl animate-in zoom-in-95">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto ring-8 ring-amber-500/5">
                <ShieldCheck className="w-7 h-7" />
              </div>
              <h2 className="text-xl font-bold text-white">
                New QR Token for Table {activeQrModal.tableNumber}
              </h2>
              <p className="text-stone-400 text-xs">
                A new cryptographically secure SHA-256 hash has been stored in the database. Previous physical QR prints for this table will no longer be valid.
              </p>
            </div>

            {/* Link & Token Box */}
            <div className="space-y-3 bg-stone-950 p-4 rounded-2xl border border-stone-800">
              <span className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider block">
                Direct Scan URL
              </span>
              <div className="flex justify-center py-4 bg-white rounded-xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img 
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(activeQrModal.url)}`}
                  alt={`QR Code for Table ${activeQrModal.tableNumber}`}
                  className="w-36 h-36"
                />
              </div>
              <p className="font-mono text-xs text-amber-400 break-all leading-relaxed bg-stone-900/80 p-2.5 rounded-xl border border-stone-800">
                {activeQrModal.url}
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copyToClipboard(activeQrModal.url)}
                  className="flex-1 border-stone-700 text-stone-200 hover:bg-stone-800 text-xs"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 mr-1.5" />
                      Copy Scan Link
                    </>
                  )}
                </Button>
                <Button
                  asChild
                  size="sm"
                  className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold text-xs"
                >
                  <a href={activeQrModal.url} target="_blank">
                    <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                    Test Scan
                  </a>
                </Button>
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                variant="outline"
                onClick={() => setActiveQrModal(null)}
                className="w-full border-stone-700 text-stone-300 hover:bg-stone-800"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
