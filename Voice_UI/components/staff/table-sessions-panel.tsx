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
    <section className="kitchen-panel kitchen-tables" aria-label="Table sessions and billing">
      <div className="kitchen-panel-heading"><h2>Tables & billing <span>{activeTablesCount}</span></h2>
        <button className="kitchen-refresh-small" type="button" onClick={fetchTables} disabled={loading} aria-label="Refresh table sessions"><RefreshCw size={17} /></button>
      </div>
      <div className="kitchen-panel-scroll" role="region" aria-label="Active table sessions" tabIndex={0}>
        <p className="kitchen-table-summary">{activeTablesCount} active · Running bills {formatINR(totalOccupiedRunningBill)}</p>
        {loading && !tables.length && <p className="kitchen-empty">Loading tables…</p>}
        {tables.filter((table) => table.hasActiveSession && table.session).map((table) => (
          <details className="kitchen-table-row" key={table.tableId}>
            <summary><strong>Table {table.tableNumber}</strong><span>{formatINR(table.runningBillInr)} · {table.unfinishedOrdersCount} pending</span></summary>
            <div className="kitchen-table-more">
              {table.displayName && <p>{table.displayName}</p>}
              <p>{table.totalOrdersCount} orders · {table.deliveredOrdersCount} delivered · {table.unfinishedOrdersCount} unfinished</p>
              <button type="button" onClick={() => handleOpenCloseModal(table)}>Bill paid & close session…</button>
            </div>
          </details>
        ))}
        {!loading && !activeTablesCount && <p className="kitchen-empty">No active table sessions.</p>}
        {!!tables.filter((table) => !table.hasActiveSession || !table.session).length && <details className="kitchen-inactive-tables">
          <summary>Available tables ({tables.filter((table) => !table.hasActiveSession || !table.session).length})</summary>
          {tables.filter((table) => !table.hasActiveSession || !table.session).map((table) => <p key={table.tableId}>Table {table.tableNumber}{table.displayName ? ` · ${table.displayName}` : ""}</p>)}
        </details>}
      </div>

      {/* Confirmation & Final Bill Closure Modal */}
      {selectedTable && (
        <div className="kitchen-modal-overlay">
          <div className="kitchen-billing-modal bg-stone-900 border border-stone-700/80 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="kitchen-billing-heading">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-stone-800 bg-stone-950">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <h3 id="kitchen-billing-heading" className="text-lg font-bold text-white">
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
                aria-label="Close table billing dialog"
                className="p-1.5 text-stone-400 hover:text-white rounded-lg hover:bg-stone-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="kitchen-billing-body p-6 space-y-5">
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
