"use client";

import { useState } from "react";
import {
  CheckCircle2,
  Clock,
  ChefHat,
  PackageCheck,
  XCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  UtensilsCrossed,
} from "lucide-react";
import { formatINR, formatTime } from "@/lib/format";
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_MESSAGES,
  ORDER_STATUS_STYLES,
} from "@/features/ordering/order-lifecycle";
import type { DemoOrder, OrderStatus } from "@/types";

export interface CustomerOrderTrackerProps {
  orders: DemoOrder[];
  isLoading?: boolean;
  isPolling?: boolean;
  error?: string | null;
  lastUpdated?: Date | null;
  isSessionClosed?: boolean;
  onRefresh?: () => void;
}

const STEPS: { status: OrderStatus; label: string; icon: typeof Clock }[] = [
  { status: "NEW", label: "Order Received", icon: Clock },
  { status: "PREPARING", label: "Being Prepared", icon: ChefHat },
  { status: "DELIVERED", label: "Delivered", icon: PackageCheck },
];

export function CustomerOrderTracker({
  orders,
  isLoading = false,
  isPolling = false,
  error = null,
  lastUpdated = null,
  isSessionClosed = false,
  onRefresh,
}: CustomerOrderTrackerProps) {
  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({});

  const toggleExpand = (orderId: string) => {
    setExpandedOrders((prev) => ({
      ...prev,
      [orderId]: !prev[orderId],
    }));
  };

  // If there are no orders yet in this session
  if (!orders.length && !isLoading && !error) {
    return null;
  }

  return (
    <section className="mt-10 rounded-[1.8rem] border border-[#dcd2c4] bg-[#fffdf9] p-5 shadow-[0_12px_40px_rgba(50,30,15,0.06)] sm:p-7">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#ece3d6] pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-[#f2e5d5] text-[#8c3e16]">
              <UtensilsCrossed size={17} />
            </span>
            <h2 className="font-display text-2xl font-bold tracking-tight text-[#2d211a] sm:text-3xl">
              Order Status
            </h2>
          </div>
          <p className="mt-1 text-xs text-[#7d6f65]">
            Live status for orders placed during your table session.
          </p>
        </div>

        {/* Polling & Refresh indicators */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 rounded-full border border-[#d6e5d8] bg-[#f1f8f3] px-3 py-1 text-xs font-medium text-[#2d6639]">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                isPolling ? "bg-[#e07e32] animate-ping" : "bg-[#3ca856] animate-pulse"
              }`}
            />
            <span>{isPolling ? "Checking…" : "Live updates active"}</span>
          </div>

          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isLoading}
              title="Check for status updates"
              className="flex h-8 items-center gap-1.5 rounded-full border border-[#dcd2c4] bg-white px-3 text-xs font-semibold text-[#5a483e] shadow-sm transition hover:bg-[#faf6f0] active:scale-95 disabled:opacity-50"
            >
              <RefreshCw size={13} className={isLoading ? "animate-spin text-[#8c3e16]" : ""} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          )}
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mt-5 flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-xs font-medium text-red-800">
          <AlertCircle size={18} className="flex-none text-red-600" />
          <span className="flex-1">{error}</span>
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="font-bold underline hover:text-red-950"
            >
              Try again
            </button>
          )}
        </div>
      )}

      {/* Session Closed Banner */}
      {isSessionClosed && (
        <div className="mt-5 flex items-start gap-3.5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-950 shadow-sm animate-in fade-in">
          <CheckCircle2 size={20} className="flex-none text-amber-600 mt-0.5" />
          <div>
            <p className="font-bold text-sm text-amber-900">Table Session Ended</p>
            <p className="mt-1 leading-relaxed text-amber-800">
              The bill for this table session was settled with cafe staff. The orders below represent your finalized receipt. To start a fresh order session, please scan the QR code at your table again.
            </p>
          </div>
        </div>
      )}

      {/* Loading state when no orders loaded yet */}
      {isLoading && !orders.length && (
        <div className="mt-6 flex flex-col items-center justify-center py-10 text-center">
          <RefreshCw size={24} className="animate-spin text-[#8c3e16]" />
          <p className="mt-3 text-sm font-semibold text-[#665448]">Loading order status…</p>
        </div>
      )}

      {/* Orders List */}
      <div className="mt-6 space-y-5">
        {orders.map((order) => {
          const isCancelled = order.status === "CANCELLED";
          const isDelivered = order.status === "DELIVERED";
          const isExpanded = expandedOrders[order.id] ?? true; // Default expanded for clarity
          const orderTotal = order.total ?? ((order.totalPaise ?? 0) / 100);
          const itemCount = order.items.reduce((sum, i) => sum + i.quantity, 0);

          return (
            <article
              key={order.id}
              className={`overflow-hidden rounded-2xl border transition-all ${
                isCancelled
                  ? "border-[#f7c2ba] bg-[#fff5f3]"
                  : isDelivered
                  ? "border-[#cce5d2] bg-[#f8fbf8]"
                  : "border-[#dfd3c2] bg-white shadow-sm"
              }`}
            >
              {/* Order Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#f0e8dc] p-4 sm:p-5">
                <div className="flex items-center gap-3">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="font-display text-lg font-extrabold text-[#2a1d17]">
                        {order.orderNumber}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                          ORDER_STATUS_STYLES[order.status]
                        }`}
                      >
                        {ORDER_STATUS_LABELS[order.status]}
                      </span>
                    </div>
                    <span className="mt-0.5 text-xs text-[#8a7b70]">
                      Placed {formatTime(order.createdAt)} · {itemCount} {itemCount === 1 ? "item" : "items"}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <span className="font-display text-lg font-bold text-[#2a1d17]">
                    {formatINR(orderTotal)}
                  </span>
                  <button
                    onClick={() => toggleExpand(order.id)}
                    aria-label={isExpanded ? "Collapse details" : "Expand details"}
                    className="grid h-8 w-8 place-items-center rounded-lg border border-[#e0d6c8] bg-white text-[#6b5a4f] hover:bg-[#fcf8f2]"
                  >
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                </div>
              </div>

              {/* Status Progression Stepper / Cancelled Notice */}
              <div className="p-4 sm:p-5">
                {isCancelled ? (
                  <div className="rounded-xl border border-red-200 bg-white/70 p-4">
                    <div className="flex items-start gap-3">
                      <XCircle size={20} className="flex-none text-red-600 mt-0.5" />
                      <div>
                        <p className="font-bold text-red-900">
                          {ORDER_STATUS_MESSAGES.CANCELLED}
                        </p>
                        {order.cancellationReason && (
                          <p className="mt-1 text-xs text-red-700">
                            <strong>Reason:</strong> {order.cancellationReason}
                          </p>
                        )}
                        <p className="mt-2 text-xs text-red-600">
                          This order will not be prepared or charged. If you have questions, please call a staff member.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    {/* Visual Stepper */}
                    <div className="relative flex items-center justify-between">
                      {/* Connecting Line */}
                      <div className="absolute left-6 right-6 top-1/2 -translate-y-1/2 h-1 bg-[#ede4d8] -z-0">
                        <div
                          className="h-full bg-[#3e724b] transition-all duration-500"
                          style={{
                            width:
                              order.status === "DELIVERED"
                                ? "100%"
                                : order.status === "PREPARING"
                                ? "50%"
                                : "0%",
                          }}
                        />
                      </div>

                      {STEPS.map((step) => {
                        const isCurrent = order.status === step.status;
                        const isDone =
                          (step.status === "NEW" && (order.status === "PREPARING" || order.status === "DELIVERED")) ||
                          (step.status === "PREPARING" && order.status === "DELIVERED") ||
                          (step.status === "DELIVERED" && order.status === "DELIVERED");

                        const StepIcon = step.icon;

                        return (
                          <div
                            key={step.status}
                            className="relative z-10 flex flex-col items-center text-center"
                          >
                            <span
                              className={`grid h-10 w-10 place-items-center rounded-full border-2 transition-all ${
                                isDone
                                  ? "border-[#3e724b] bg-[#3e724b] text-white shadow-sm"
                                  : isCurrent
                                  ? "border-[#a84d18] bg-white text-[#a84d18] ring-4 ring-[#fde8d4]"
                                  : "border-[#d8cebe] bg-[#fbf8f3] text-[#a4968a]"
                              }`}
                            >
                              {isDone && !isCurrent ? (
                                <CheckCircle2 size={18} />
                              ) : (
                                <StepIcon size={17} />
                              )}
                            </span>
                            <span
                              className={`mt-2 text-xs font-bold ${
                                isCurrent
                                  ? "text-[#a84d18]"
                                  : isDone
                                  ? "text-[#2e5739]"
                                  : "text-[#9c8e82]"
                              }`}
                            >
                              {step.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Status Message */}
                    <div className="mt-5 rounded-xl border border-[#ece3d4] bg-[#fcf9f4] p-3 text-center">
                      <p className="text-xs font-semibold text-[#5a483e]">
                        {ORDER_STATUS_MESSAGES[order.status]}
                      </p>
                    </div>
                  </div>
                )}

                {/* Expandable Order Items Breakdown */}
                {isExpanded && (
                  <div className="mt-4 border-t border-[#f0e8dc] pt-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-[#8a7b70]">
                      Ordered Items
                    </p>
                    <ul className="mt-3 divide-y divide-[#f3ece0]">
                      {order.items.map((item, idx) => (
                        <li
                          key={idx}
                          className="flex items-center justify-between py-2 text-sm text-[#3b2d24]"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{item.name}</span>
                            <span className="rounded bg-[#f0e7db] px-1.5 py-0.5 text-xs font-bold text-[#68564b]">
                              ×{item.quantity}
                            </span>
                          </div>
                          <span className="font-medium text-[#5a483e]">
                            {formatINR(item.lineTotal ?? item.unitPrice * item.quantity)}
                          </span>
                        </li>
                      ))}
                    </ul>

                    {/* Customer Notes if present */}
                    {order.kitchenNote && (
                      <div className="mt-3 rounded-lg bg-[#f7f0e6] p-2.5 text-xs text-[#6a584c]">
                        <span className="font-bold">Special instructions: </span>
                        <span>{order.kitchenNote}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {lastUpdated && (
        <p className="mt-5 text-center text-[11px] text-[#9b8d81]">
          Last checked at {lastUpdated.toLocaleTimeString()} · Updates automatically
        </p>
      )}
    </section>
  );
}
