"use client";

import { useEffect, useState, useCallback } from "react";
import {
  CreditCard,
  Banknote,
  Smartphone,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  X,
  Receipt,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { formatINR } from "@/lib/format";

export interface TableSummary {
  tableId: string;
  tableNumber: number;
  displayName: string | null;
  isActive: boolean;
  hasActiveSession: boolean;
  session: {
    id: string;
    status: "ACTIVE" | "CLOSED";
    createdAt: string;
  } | null;
  runningBillInr: number;
  totalOrdersCount: number;
  deliveredOrdersCount: number;
  unfinishedOrdersCount: number;
}

export interface SessionSummaryResponse {
  session: {
    id: string;
    status: string;
    createdAt: string;
    closedAt: string | null;
    table: {
      id: string;
      table_number: number;
      display_name: string | null;
    };
  };
  summary: {
    totalOrdersCount: number;
    deliveredOrdersCount: number;
    cancelledOrdersCount: number;
    unfinishedOrdersCount: number;
    hasUnfinishedOrders: boolean;
    finalBillInr: number;
    finalBillPaise: number;
  };
  unfinishedOrders: Array<{
    id: string;
    orderNumber: string;
    status: string;
    customerName: string | null;
    createdAt: string;
  }>;
}

interface TableSessionsPanelProps {
  onSessionClosed?: () => void;
}

export function TableSessionsPanel({ onSessionClosed }: TableSessionsPanelProps) {
  const [tables, setTables] = useState<TableSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTable, setSelectedTable] = useState<TableSummary | null>(null);
  const [sessionSummary, setSessionSummary] = useState<SessionSummaryResponse | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "CARD" | "UPI" | "OTHER">("CASH");
  const [forceOverride, setForceOverride] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const fetchTables = useCallback(async () => {
    try {
      const res = await fetch("/api/staff/table-sessions", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load table sessions");
      const data = (await res.json()) as { tables?: TableSummary[] };
      setTables(data.tables || []);
    } catch (err: unknown) {
      console.error("[TableSessionsPanel] Fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchTables();
    }, 0);
    const interval = setInterval(fetchTables, 15000);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [fetchTables]);

  const handleOpenCloseModal = async (table: TableSummary) => {
    if (!table.session) return;
    setSelectedTable(table);
    setSessionSummary(null);
    setPaymentMethod("CASH");
    setForceOverride(false);
    setLoadingSummary(true);

    try {
      const res = await fetch(`/api/staff/table-sessions/${table.session.id}/summary`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const err = (await res.json()) as { message?: string };
        throw new Error(err.message || "Failed to load session details");
      }
      const data: SessionSummaryResponse = await res.json();
      setSessionSummary(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error loading session";
      toast.error(message);
      setSelectedTable(null);
    } finally {
      setLoadingSummary(false);
    }
  };

  const handleConfirmClosure = async () => {
    if (!selectedTable?.session) return;
    setIsClosing(true);

    try {
      const res = await fetch(`/api/staff/table-sessions/${selectedTable.session.id}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentMethod,
          force: forceOverride,
        }),
      });

      const data = (await res.json()) as {
        success?: boolean;
        error?: string;
        message?: string;
        session?: {
          final_bill_amount_inr?: number;
        };
      };

      if (!res.ok) {
        if (data.error === "SESSION_HAS_UNFINISHED_ORDERS") {
          toast.error(data.message || "Table has unfinished orders in the kitchen queue.");
          return;
        }
        if (data.error === "SESSION_ALREADY_CLOSED") {
          toast.error("This table session is already closed.");
          setSelectedTable(null);
          fetchTables();
          onSessionClosed?.();
          return;
        }
        throw new Error(data.message || "Failed to close table session");
      }

      toast.success(
        `Table ${selectedTable.tableNumber} session closed! Bill: ${formatINR(data.session?.final_bill_amount_inr ?? 0)} confirmed via ${paymentMethod}.`
      );
      setSelectedTable(null);
      await fetchTables();
      onSessionClosed?.();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Closure failed";
      toast.error(message);
    } finally {
      setIsClosing(false);
    }
  };

  const activeTablesCount = tables.filter((t) => t.hasActiveSession).length;
  const totalOccupiedRunningBill = tables.reduce((sum, t) => sum + (t.runningBillInr || 0), 0);

  return (
    <section className="bg-stone-900/90 border border-stone-800 rounded-2xl p-4 sm:p-6 mb-6 shadow-xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-stone-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
            <Receipt className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-bold text-white text-lg flex items-center gap-2">
              Table Sessions & Billing
              <span className="text-xs font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full">
                {activeTablesCount} Active Table{activeTablesCount === 1 ? "" : "s"}
              </span>
            </h2>
            <p className="text-xs text-stone-400 mt-0.5">
              Confirm physical payments and close table sessions to initialize new guest cycles
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-[11px] uppercase tracking-wider text-stone-400 font-semibold block">
              Active Tables Total
            </span>
            <span className="text-lg font-bold text-emerald-400 font-mono">
              {formatINR(totalOccupiedRunningBill)}
            </span>
          </div>
          <button
            onClick={fetchTables}
            disabled={loading}
            className="p-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 transition-colors cursor-pointer"
            title="Refresh table sessions"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Tables Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-5">
        {tables.map((table) => {
          const hasSession = table.hasActiveSession && table.session;
          const hasUnfinished = table.unfinishedOrdersCount > 0;

          return (
            <div
              key={table.tableId}
              className={`rounded-xl border p-4 flex flex-col justify-between gap-4 transition-all ${
                hasSession
                  ? "bg-stone-950/80 border-amber-500/30 shadow-lg shadow-black/20"
                  : "bg-stone-950/40 border-stone-800/80 opacity-70"
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-base font-extrabold text-white">
                      Table {table.tableNumber}
                    </span>
                    {table.displayName && (
                      <span className="text-xs text-stone-400 block">{table.displayName}</span>
                    )}
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                      hasSession
                        ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                        : "bg-stone-800 text-stone-400 border-stone-700"
                    }`}
                  >
                    {hasSession ? "ACTIVE SESSION" : "AVAILABLE"}
                  </span>
                </div>

                {hasSession ? (
                  <div className="mt-3 space-y-2">
                    <div className="flex items-baseline justify-between bg-stone-900/60 p-2.5 rounded-lg border border-stone-800/60">
                      <span className="text-xs text-stone-400">Running Bill:</span>
                      <span className="text-lg font-black text-amber-300 font-mono">
                        {formatINR(table.runningBillInr)}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5 text-center text-[11px] pt-1">
                      <div className="bg-stone-900/40 p-1.5 rounded border border-stone-800/40">
                        <span className="text-stone-400 block text-[10px]">Orders</span>
                        <span className="font-bold text-white">{table.totalOrdersCount}</span>
                      </div>
                      <div className="bg-stone-900/40 p-1.5 rounded border border-stone-800/40">
                        <span className="text-stone-400 block text-[10px]">Delivered</span>
                        <span className="font-bold text-emerald-400">
                          {table.deliveredOrdersCount}
                        </span>
                      </div>
                      <div
                        className={`p-1.5 rounded border ${
                          hasUnfinished
                            ? "bg-rose-950/40 border-rose-500/40 text-rose-300 font-bold"
                            : "bg-stone-900/40 border-stone-800/40 text-stone-300 font-medium"
                        }`}
                      >
                        <span className="block text-[10px]">Pending</span>
                        <span>{table.unfinishedOrdersCount}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="mt-4 text-xs text-stone-500 italic">
                    No active session. Waiting for guest QR scan.
                  </p>
                )}
              </div>

              {hasSession && (
                <button
                  onClick={() => handleOpenCloseModal(table)}
                  className="w-full mt-2 py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-stone-950 shadow-md shadow-amber-950/40 active:scale-[0.98]"
                >
                  <Receipt className="w-4 h-4" />
                  <span>Bill Paid & Close Session</span>
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Confirmation & Final Bill Closure Modal */}
      {selectedTable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-stone-900 border border-stone-700/80 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-stone-800 bg-stone-950">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">
                    Close Table {selectedTable.tableNumber} Session
                  </h3>
                  <p className="text-xs text-stone-400">
                    Confirm physical settlement and finalize billing
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedTable(null)}
                disabled={isClosing}
                className="p-1.5 text-stone-400 hover:text-white rounded-lg hover:bg-stone-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5">
              {loadingSummary ? (
                <div className="py-12 flex flex-col items-center justify-center text-center">
                  <RefreshCw className="w-8 h-8 text-amber-400 animate-spin mb-3" />
                  <p className="text-sm text-stone-300">Calculating authoritative final bill...</p>
                </div>
              ) : sessionSummary ? (
                <>
                  {/* Bill Summary Banner */}
                  <div className="bg-stone-950 border border-stone-800 rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold uppercase tracking-wider text-stone-400">
                        Final Server Bill
                      </span>
                      <p className="text-xs text-stone-500 mt-0.5">
                        {sessionSummary.summary.deliveredOrdersCount} delivered order(s) included ·{" "}
                        {sessionSummary.summary.cancelledOrdersCount} cancelled excluded
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-3xl font-black text-amber-300 font-mono">
                        {formatINR(sessionSummary.summary.finalBillInr)}
                      </span>
                    </div>
                  </div>

                  {/* Unfinished Orders Warning */}
                  {sessionSummary.summary.hasUnfinishedOrders && (
                    <div className="bg-rose-950/40 border border-rose-500/40 rounded-xl p-4 text-rose-200">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                        <div>
                          <h4 className="text-xs font-bold uppercase tracking-wider text-rose-300">
                            Warning: Unfinished Orders Pending
                          </h4>
                          <p className="text-xs text-rose-200 mt-1 leading-relaxed">
                            This table has{" "}
                            <strong>
                              {sessionSummary.summary.unfinishedOrdersCount} order(s)
                            </strong>{" "}
                            currently in NEW or PREPARING status:
                          </p>
                          <ul className="mt-2 space-y-1 text-xs text-rose-300 font-mono">
                            {sessionSummary.unfinishedOrders.map((u) => (
                              <li key={u.id} className="flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                                <span>{u.orderNumber}</span>
                                <span className="text-[10px] bg-rose-900/60 px-1.5 py-0.5 rounded">
                                  {u.status}
                                </span>
                              </li>
                            ))}
                          </ul>

                          <label className="flex items-center gap-2 mt-3 pt-3 border-t border-rose-500/20 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={forceOverride}
                              onChange={(e) => setForceOverride(e.target.checked)}
                              className="rounded border-rose-400 text-rose-600 focus:ring-rose-500"
                            />
                            <span className="text-xs font-semibold text-rose-100">
                              Confirm override and close anyway (not recommended if food is being prepared)
                            </span>
                          </label>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Payment Method Selector */}
                  <div>
                    <label className="text-xs font-bold text-stone-300 uppercase tracking-wider block mb-2">
                      Physical Payment Method:
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setPaymentMethod("CASH")}
                        className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                          paymentMethod === "CASH"
                            ? "bg-amber-500/20 border-amber-500 text-amber-300 ring-1 ring-amber-500/40"
                            : "bg-stone-950 border-stone-800 text-stone-400 hover:text-white"
                        }`}
                      >
                        <Banknote className="w-5 h-5" />
                        <span>CASH</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setPaymentMethod("CARD")}
                        className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                          paymentMethod === "CARD"
                            ? "bg-amber-500/20 border-amber-500 text-amber-300 ring-1 ring-amber-500/40"
                            : "bg-stone-950 border-stone-800 text-stone-400 hover:text-white"
                        }`}
                      >
                        <CreditCard className="w-5 h-5" />
                        <span>CARD (POS)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setPaymentMethod("UPI")}
                        className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                          paymentMethod === "UPI"
                            ? "bg-amber-500/20 border-amber-500 text-amber-300 ring-1 ring-amber-500/40"
                            : "bg-stone-950 border-stone-800 text-stone-400 hover:text-white"
                        }`}
                      >
                        <Smartphone className="w-5 h-5" />
                        <span>UPI / QR</span>
                      </button>
                    </div>
                  </div>

                  {/* Summary Checklist */}
                  <div className="rounded-xl bg-stone-950/70 border border-stone-800/80 p-3.5 space-y-1.5 text-xs text-stone-400">
                    <p className="flex items-center gap-2 text-stone-300 font-semibold">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      After closing this session:
                    </p>
                    <p className="pl-6">• This session will be permanently locked against new orders.</p>
                    <p className="pl-6">• Historical orders & timestamps will remain preserved.</p>
                    <p className="pl-6">• The next customer QR scan will start a fresh table session with ₹0 bill.</p>
                  </div>
                </>
              ) : null}
            </div>

            {/* Modal Actions */}
            <div className="p-5 border-t border-stone-800 bg-stone-950 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setSelectedTable(null)}
                disabled={isClosing}
                className="px-4 py-2 text-xs font-semibold text-stone-300 hover:text-white hover:bg-stone-800 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmClosure}
                disabled={
                  isClosing ||
                  loadingSummary ||
                  (sessionSummary?.summary.hasUnfinishedOrders && !forceOverride)
                }
                className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:opacity-50 disabled:pointer-events-none text-stone-950 text-xs font-bold rounded-xl shadow-lg transition-all flex items-center gap-2 cursor-pointer"
              >
                {isClosing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Processing Closure...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Bill Paid & Close Session</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
