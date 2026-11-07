"use client";

import { useState } from "react";
import {
  RefreshCw,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { BrandedQrModal } from "@/components/admin/branded-qr-modal";
import { formatINR } from "@/lib/format";

interface TableDoc {
  _id: Id<"tables">;
  tableNumber: number;
  displayName: string;
  slug: string;
  isActive: boolean;
  createdAt?: number;
  updatedAt?: number;
}

export default function AdminTablesPage() {
  const tables = useQuery(api.tables.listTables);
  const activeSessions = useQuery(api.sessions.getActiveTableSessions);

  const toggleTableActiveMutation = useMutation(api.tables.adminToggleTableActive);
  const regenerateQrMutation = useMutation(api.tables.adminRegenerateTableQrToken);

  const loading = tables === undefined || activeSessions === undefined;
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);

  // Modal displaying newly minted token with Courista center-branded QR
  const [activeQrModal, setActiveQrModal] = useState<{
    tableNumber: number;
    token: string;
    url: string;
  } | null>(null);

  const toggleTableActive = async (table: TableDoc) => {
    try {
      const newStatus = !table.isActive;
      await toggleTableActiveMutation({
        tableId: table._id,
        isActive: newStatus,
      });

      toast.success(`Table ${table.tableNumber} is now ${newStatus ? "active" : "inactive"}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to toggle table status";
      toast.error(msg);
    }
  };

  const regenerateToken = async (table: TableDoc) => {
    setRegeneratingId(table._id);
    try {
      // 1. Generate 32-byte cryptographically secure random token
      const rawBytes = new Uint8Array(32);
      crypto.getRandomValues(rawBytes);
      const rawToken = Array.from(rawBytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      // 2. Compute SHA-256 hash for secure storage
      const hashBuffer = await crypto.subtle.digest("SHA-256", rawBytes);
      const newQrTokenHash = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      // 3. Update table QR token hash in Convex backend
      await regenerateQrMutation({
        tableId: table._id,
        newQrTokenHash,
      });

      // 4. Construct customer scanning URL
      const scanUrl = `${window.location.origin}/qr?token=${rawToken}`;
      setActiveQrModal({
        tableNumber: table.tableNumber,
        token: rawToken,
        url: scanUrl,
      });

      toast.success(`New secure QR token generated for Table ${table.tableNumber}!`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to regenerate token";
      toast.error(msg);
    } finally {
      setRegeneratingId(null);
    }
  };

  // Map active sessions to table ID
  const activeSessionMap = new Map(
    (activeSessions || []).map((s) => [s.tableId, s])
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Dining Tables & QR Tokens</h1>
          <p className="text-stone-400 text-sm mt-0.5">
            Manage table availability, inspect active dining sessions, and regenerate cryptographic QR tokens
          </p>
        </div>
      </div>

      {/* Tables Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full py-20 flex flex-col items-center justify-center text-stone-400 space-y-3">
            <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
            <p className="text-sm">Loading tables from Convex...</p>
          </div>
        ) : (
          (tables ?? []).map((table) => {
            const isRegenerating = regeneratingId === table._id;
            const activeSession = activeSessionMap.get(table._id);

            return (
              <div
                key={table._id}
                className={`bg-stone-900/90 border rounded-2xl p-5 space-y-4 transition-all ${
                  table.isActive
                    ? "border-stone-800 hover:border-stone-700"
                    : "border-stone-850 opacity-60"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <span className="text-xs font-semibold uppercase tracking-wider text-stone-400">
                      Dining Table
                    </span>
                    <h2 className="text-2xl font-bold text-white">Table {table.tableNumber}</h2>
                    <p className="text-xs text-stone-400 font-medium">
                      {table.displayName || `Table ${table.tableNumber}`}
                    </p>
                  </div>

                  <div className="flex flex-col items-end gap-1.5">
                    <button
                      onClick={() => toggleTableActive(table)}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer ${
                        table.isActive
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20"
                          : "bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20"
                      }`}
                    >
                      {table.isActive ? "Active" : "Disabled"}
                    </button>

                    {activeSession ? (
                      <span className="text-[11px] bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded-full font-medium">
                        Bill Active ({formatINR(activeSession.runningBillInr)})
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
                    disabled={isRegenerating || !table.isActive}
                    onClick={() => regenerateToken(table)}
                    className="border-stone-700 text-stone-200 hover:bg-stone-800 text-xs flex-1 cursor-pointer"
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
                    <a href={`/table/${table.slug}`} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Newly Regenerated Branded QR Modal */}
      {activeQrModal && (
        <BrandedQrModal
          tableNumber={activeQrModal.tableNumber}
          token={activeQrModal.token}
          url={activeQrModal.url}
          onClose={() => setActiveQrModal(null)}
        />
      )}
    </div>
  );
}
