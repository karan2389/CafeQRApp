"use client";

import { useState } from "react";
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
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { formatINR } from "@/lib/format";

interface TableSessionsPanelProps {
  onSessionClosed?: () => void;
}

export function TableSessionsPanel({ onSessionClosed }: TableSessionsPanelProps) {
  const tables = useQuery(api.tables.listTables);
  const activeSessions = useQuery(api.sessions.getActiveTableSessions);
  const settleAndCloseMutation = useMutation(api.billing.settleAndCloseTableSession);

  const [selectedSessionId, setSelectedSessionId] = useState<Id<"tableOrderSessions"> | null>(null);
  const [selectedTableNumber, setSelectedTableNumber] = useState<number | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "CARD" | "UPI" | "OTHER">("CASH");
  const [isClosing, setIsClosing] = useState(false);

  // Authoritative running bill for currently selected table session
  const sessionBill = useQuery(
    api.billing.getTableSessionBill,
    selectedSessionId ? { tableOrderSessionId: selectedSessionId } : "skip"
  );

  const loading = tables === undefined || activeSessions === undefined;

  const handleOpenCloseModal = (session: {
    _id: Id<"tableOrderSessions">;
    tableNumber: number;
  }) => {
    setSelectedSessionId(session._id);
    setSelectedTableNumber(session.tableNumber);
    setPaymentMethod("CASH");
  };

  const handleConfirmClosure = async () => {
    if (!selectedSessionId || !selectedTableNumber) return;
    setIsClosing(true);

    try {
      const result = await settleAndCloseMutation({
        tableOrderSessionId: selectedSessionId,
        paymentMethod,
      });

      const finalAmountInr = result.finalBillAmountPaise / 100;
      toast.success(
        `Table ${selectedTableNumber} session closed! Bill: ${formatINR(finalAmountInr)} confirmed via ${paymentMethod}.`
      );
      setSelectedSessionId(null);
      setSelectedTableNumber(null);
      onSessionClosed?.();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Closure failed";
      toast.error(message);
    } finally {
      setIsClosing(false);
    }
  };

  const activeTablesCount = activeSessions?.length ?? 0;
  const totalOccupiedRunningBill = (activeSessions ?? []).reduce(
    (sum, s) => sum + (s.runningBillInr || 0),
    0
  );

  const activeTableNumbers = new Set((activeSessions ?? []).map((s) => s.tableNumber));
  const availableTables = (tables ?? []).filter((t) => !activeTableNumbers.has(t.tableNumber));

  return (
    <section className="kitchen-panel kitchen-tables" aria-label="Table sessions and billing">
      <div className="kitchen-panel-heading">
        <h2>
          Tables & billing <span>{activeTablesCount}</span>
        </h2>
      </div>

      <div className="kitchen-panel-scroll" role="region" aria-label="Active table sessions" tabIndex={0}>
        <p className="kitchen-table-summary">
          {activeTablesCount} active · Running bills {formatINR(totalOccupiedRunningBill)}
        </p>

        {loading && <p className="kitchen-empty">Loading table sessions from Convex…</p>}

        {!loading && activeSessions && activeSessions.length > 0
          ? activeSessions.map((session) => (
            <details className="kitchen-table-row" key={session._id}>
              <summary>
                <strong>Table {session.tableNumber}</strong>
                <span>
                  {formatINR(session.runningBillInr)} · {session.unfinishedOrdersCount} pending
                </span>
              </summary>
              <div className="kitchen-table-more">
                {session.displayName && <p>{session.displayName}</p>}
                <p>
                  {session.totalOrdersCount} orders · {session.deliveredOrdersCount} delivered ·{" "}
                  {session.unfinishedOrdersCount} unfinished
                </p>
                <button
                  type="button"
                  className="cursor-pointer"
                  onClick={() =>
                    handleOpenCloseModal({
                      _id: session._id,
                      tableNumber: session.tableNumber,
                    })
                  }
                >
                  Bill paid & close session…
                </button>
              </div>
            </details>
          ))
          : null}

        {!loading && !activeTablesCount && <p className="kitchen-empty">No active table sessions.</p>}

        {!loading && availableTables.length > 0 && (
          <details className="kitchen-inactive-tables">
            <summary>Available tables ({availableTables.length})</summary>
            {availableTables.map((table) => (
              <p key={table._id}>
                Table {table.tableNumber}
                {table.displayName ? ` · ${table.displayName}` : ""}
              </p>
            ))}
          </details>
        )}
      </div>

      {/* Confirmation & Final Bill Closure Modal */}
      {selectedSessionId && selectedTableNumber && (
        <div className="kitchen-modal-overlay">
          <div
            className="kitchen-billing-modal bg-stone-900 border border-stone-700/80 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="kitchen-billing-heading"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-stone-800 bg-stone-950">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <h3 id="kitchen-billing-heading" className="text-lg font-bold text-white">
                    Close Table {selectedTableNumber} Session
                  </h3>
                  <p className="text-xs text-stone-400">
                    Confirm physical settlement and finalize billing
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setSelectedSessionId(null);
                  setSelectedTableNumber(null);
                }}
                disabled={isClosing}
                aria-label="Close table billing dialog"
                className="p-1.5 text-stone-400 hover:text-white rounded-lg hover:bg-stone-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="kitchen-billing-body p-6 space-y-5">
              {sessionBill === undefined ? (
                <div className="py-12 flex flex-col items-center justify-center text-center">
                  <RefreshCw className="w-8 h-8 text-amber-400 animate-spin mb-3" />
                  <p className="text-sm text-stone-300">Calculating authoritative final bill...</p>
                </div>
              ) : sessionBill ? (
                <>
                  {/* Bill Summary Banner */}
                  <div className="bg-stone-950 border border-stone-800 rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold uppercase tracking-wider text-stone-400">
                        Final Server Bill
                      </span>
                      <p className="text-xs text-stone-500 mt-0.5">
                        {sessionBill.deliveredOrders.length} delivered order(s) included ·{" "}
                        {sessionBill.cancelledOrders.length} cancelled excluded
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-3xl font-black text-amber-300 font-mono">
                        {formatINR(sessionBill.payableAmountPaise / 100)}
                      </span>
                    </div>
                  </div>

                  {/* Unfinished Orders Warning */}
                  {!sessionBill.isReadyForClosure && (
                    <div className="bg-rose-950/40 border border-rose-500/40 rounded-xl p-4 text-rose-200">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                        <div>
                          <h4 className="text-xs font-bold uppercase tracking-wider text-rose-300">
                            Warning: Unfinished Orders in Preparation
                          </h4>
                          <p className="text-xs text-rose-200 mt-1 leading-relaxed">
                            This table has{" "}
                            <strong>
                              {sessionBill.unfinishedOrders.length} order(s)
                            </strong>{" "}
                            currently in NEW or PREPARING status:
                          </p>
                          <ul className="mt-2 space-y-1 text-xs text-rose-300 font-mono">
                            {sessionBill.unfinishedOrders.map((u) => (
                              <li key={u._id} className="flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                                <span>{u.orderNumber}</span>
                                <span className="text-[10px] bg-rose-900/60 px-1.5 py-0.5 rounded">
                                  {u.status}
                                </span>
                              </li>
                            ))}
                          </ul>
                          <p className="mt-2 text-[11px] text-rose-300/80">
                            Please complete delivery or cancel pending items before finalizing settlement.
                          </p>
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
                        className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1.5 transition-all cursor-pointer ${paymentMethod === "CASH"
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
                        className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1.5 transition-all cursor-pointer ${paymentMethod === "CARD"
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
                        className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1.5 transition-all cursor-pointer ${paymentMethod === "UPI"
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
                    <p className="pl-6">• Delivered orders become PAID and customer sessions revoked.</p>
                    <p className="pl-6">• The next customer QR scan will start a fresh table session with ₹0 bill.</p>
                  </div>
                </>
              ) : null}
            </div>

            {/* Modal Actions */}
            <div className="p-5 border-t border-stone-800 bg-stone-950 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setSelectedSessionId(null);
                  setSelectedTableNumber(null);
                }}
                disabled={isClosing}
                className="px-4 py-2 text-xs font-semibold text-stone-300 hover:text-white hover:bg-stone-800 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmClosure}
                disabled={isClosing || sessionBill === undefined || !sessionBill?.isReadyForClosure}
                className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:opacity-50 disabled:pointer-events-none text-stone-950 text-xs font-bold rounded-xl shadow-lg transition-all flex items-center gap-2 cursor-pointer"
              >
                {isClosing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Processing Settlement...</span>
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
