"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import {
  ChefHat,
  Clock,
  CheckCircle2,
  RefreshCw,
  Volume2,
  VolumeX,
  FileText,
  User,
  Bell,
  X,
  AlertTriangle,
  Ban,
  AlertCircle,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { formatINR } from "@/lib/format";
import { getSupabaseClient } from "@/lib/supabase/client";
import { playKitchenAlert } from "@/features/kitchen/kitchen-sound";
import type { ServiceRequest, ServiceRequestStatus, ServiceRequestType } from "@/types";
import { SERVICE_REQUEST_TYPE_LABELS } from "@/features/service-requests/service-request-lifecycle";
import { TableSessionsPanel } from "@/components/staff/table-sessions-panel";

export interface KitchenOrderItem {
  id: string;
  item_name: string;
  unit_price_inr: number;
  quantity: number;
  customization_notes: string | null;
}

export interface KitchenOrder {
  id: string;
  order_number: string | null;
  customer_name: string | null;
  order_notes: string | null;
  total_amount_inr: number;
  status: "PENDING" | "NEW" | "PREPARING" | "DELIVERED" | "CANCELLED";
  cancellation_reason?: string | null;
  created_at: string;
  updated_at: string;
  tables: {
    id: string;
    table_number: number;
    display_name: string | null;
  };
  order_items: KitchenOrderItem[];
}

export interface NewOrderAlertInfo {
  id: string;
  orderId: string;
  orderNumber: string;
  tableNumber: number | string;
  itemCount: number;
  itemsSummary: string;
  createdAt: number;
}

export type QueueFilter = "ACTIVE" | "NEW" | "PREPARING" | "DELIVERED" | "CANCELLED" | "ALL";

export function KitchenDashboardClient() {
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<QueueFilter>("ACTIVE");
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(() => new Date());
  const [now, setNow] = useState<number>(() => (typeof window !== "undefined" ? Date.now() : 0));
  const [realtimeStatus, setRealtimeStatus] = useState<"connected" | "connecting" | "error" | "disconnected">(() => {
    if (typeof window === "undefined") return "connecting";
    return getSupabaseClient() ? "connecting" : "disconnected";
  });
  const [newOrderAlert, setNewOrderAlert] = useState<NewOrderAlertInfo | null>(null);

  // Cancellation modal state
  const [cancellingOrder, setCancellingOrder] = useState<KitchenOrder | null>(null);
  const [cancellationReason, setCancellationReason] = useState("");

  const soundEnabledRef = useRef(soundEnabled);
  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  const playedAudioOrderIds = useRef<Set<string>>(new Set());

  // Phase 6: Service Requests state
  const [serviceRequests, setServiceRequests] = useState<ServiceRequest[]>([]);
  const [updatingServiceId, setUpdatingServiceId] = useState<string | null>(null);
  const [newServiceAlert, setNewServiceAlert] = useState<{
    id: string;
    tableNumber: number | string;
    requestType: string;
    note?: string | null;
    createdAt: number;
  } | null>(null);
  const playedAudioServiceIds = useRef<Set<string>>(new Set());

  const fetchServiceRequests = useCallback(async () => {
    try {
      const res = await fetch("/api/staff/service-requests");
      if (res.ok) {
        const data = (await res.json()) as { serviceRequests?: ServiceRequest[]; requests?: ServiceRequest[] };
        const list = data.serviceRequests || data.requests;
        if (list) {
          setServiceRequests(list);
        }
      }
    } catch (err) {
      console.error("[KitchenService] Error fetching service requests:", err);
    }
  }, []);

  const fetchOrders = useCallback(async (isManual = false) => {
    try {
      if (isManual) setLoading(true);
      const res = await fetch("/api/staff/orders");
      if (!res.ok) {
        if (isManual) toast.error("Failed to load orders");
        return;
      }
      const data = (await res.json()) as { orders?: KitchenOrder[] };
      if (data.orders) {
        setOrders((prev) => {
          const incoming = data.orders || [];
          const map = new Map<string, KitchenOrder>();
          for (const o of prev) map.set(o.id, o);
          for (const o of incoming) map.set(o.id, o);
          return Array.from(map.values());
        });
        setLastRefreshed(new Date());
      }
    } catch (err: unknown) {
      console.error("[KitchenDashboard] Fetch error:", err);
      if (isManual) toast.error("Network error fetching orders");
    } finally {
      setLoading(false);
    }
  }, []);

  // Timer for relative time computation and banner timeout
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Supabase Realtime Subscription
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return;
    }

    const channel = supabase
      .channel("kitchen-orders-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        async (payload) => {
          const newOrderId = payload.new?.id as string;
          if (!newOrderId) return;

          try {
            // Fetch complete order with joined table and order_items
            const res = await fetch(`/api/staff/orders/${newOrderId}`);
            if (res.ok) {
              const data = (await res.json()) as { order?: KitchenOrder };
              if (data.order) {
                const fullOrder = data.order;
                setOrders((prev) => {
                  if (prev.some((o) => o.id === fullOrder.id)) {
                    return prev.map((o) => (o.id === fullOrder.id ? fullOrder : o));
                  }
                  return [fullOrder, ...prev];
                });

                // Play audio alert if enabled and not already played for this order
                if (soundEnabledRef.current && !playedAudioOrderIds.current.has(fullOrder.id)) {
                  playedAudioOrderIds.current.add(fullOrder.id);
                  try {
                    playKitchenAlert("STANDARD");
                  } catch (audioErr) {
                    console.warn("[Kitchen] Audio alert blocked by browser:", audioErr);
                  }
                }

                // Show visible new order notification banner
                const itemCount =
                  fullOrder.order_items?.reduce((s, i) => s + i.quantity, 0) || 0;
                const itemsSummary =
                  fullOrder.order_items
                    ?.map((i) => `${i.quantity}× ${i.item_name}`)
                    .slice(0, 2)
                    .join(", ") +
                  ((fullOrder.order_items?.length || 0) > 2
                    ? ` +${fullOrder.order_items.length - 2} more`
                    : "");

                setNewOrderAlert({
                  id: fullOrder.id,
                  orderId: fullOrder.id,
                  orderNumber: fullOrder.order_number || `#${fullOrder.id.slice(0, 4)}`,
                  tableNumber: fullOrder.tables?.table_number ?? "—",
                  itemCount,
                  itemsSummary,
                  createdAt: Date.now(),
                });

                toast.info(`New Order ${fullOrder.order_number || ""} arrived from Table ${fullOrder.tables?.table_number ?? "—"}`);
              }
            } else {
              // Fallback to fetching all orders
              fetchOrders(false);
            }
          } catch (err) {
            console.error("[KitchenRealtime] Error processing INSERT:", err);
            fetchOrders(false);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders" },
        (payload) => {
          const updatedId = payload.new?.id as string;
          const updatedStatus = payload.new?.status as KitchenOrder["status"] | undefined;
          const updatedAt = payload.new?.updated_at as string | undefined;
          const cancellationReason = payload.new?.cancellation_reason as string | undefined;

          if (updatedId && updatedStatus) {
            setOrders((prev) =>
              prev.map((o) =>
                o.id === updatedId
                  ? {
                      ...o,
                      status: updatedStatus,
                      cancellation_reason: cancellationReason ?? o.cancellation_reason,
                      updated_at: updatedAt || o.updated_at,
                    }
                  : o
              )
            );
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "service_requests" },
        async (payload) => {
          const newRequestId = payload.new?.id as string;
          if (!newRequestId) return;

          const rawType = (payload.new?.request_type as ServiceRequestType) || "CALL_STAFF";
          const label = SERVICE_REQUEST_TYPE_LABELS[rawType] || "Staff Assistance";

          // Play alert chime for service requests if enabled
          if (soundEnabledRef.current && !playedAudioServiceIds.current.has(newRequestId)) {
            playedAudioServiceIds.current.add(newRequestId);
            try {
              playKitchenAlert("BELL");
            } catch (audioErr) {
              console.warn("[Kitchen] Audio alert blocked by browser:", audioErr);
            }
          }

          // Fetch full joined service requests from server to resolve table number
          try {
            const res = await fetch("/api/staff/service-requests");
            if (res.ok) {
              const data = (await res.json()) as { serviceRequests?: ServiceRequest[]; requests?: ServiceRequest[] };
              const list = data.serviceRequests || data.requests;
              if (list) {
                setServiceRequests(list);
                const found = list.find((r) => r.id === newRequestId);
                const tblNumber = found?.tables?.table_number ?? found?.table_number ?? "—";

                setNewServiceAlert({
                  id: newRequestId,
                  tableNumber: tblNumber,
                  requestType: label,
                  note: (payload.new?.note as string) || null,
                  createdAt: Date.now(),
                });

                toast.info(`Table ${tblNumber}: ${label} requested!`, {
                  icon: "🔔",
                  duration: 8000,
                });
                return;
              }
            }
          } catch {
            fetchServiceRequests();
          }

          toast.info(`Table Service Alert: ${label}`, {
            icon: "🔔",
            duration: 8000,
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "service_requests" },
        (payload) => {
          const updatedId = payload.new?.id as string;
          const updatedStatus = payload.new?.status as ServiceRequestStatus | undefined;
          if (updatedId && updatedStatus) {
            setServiceRequests((prev) =>
              prev.map((r) =>
                r.id === updatedId
                  ? {
                      ...r,
                      status: updatedStatus,
                      acknowledged_at: (payload.new?.acknowledged_at as string) ?? r.acknowledged_at,
                      resolved_at: (payload.new?.resolved_at as string) ?? r.resolved_at,
                      updated_at: (payload.new?.updated_at as string) ?? r.updated_at,
                    }
                  : r
              )
            );
          }
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setRealtimeStatus("connected");
        } else if (status === "CLOSED" || status === "CHANNEL_ERROR") {
          setRealtimeStatus("error");
        } else {
          setRealtimeStatus("connecting");
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchOrders, fetchServiceRequests]);

  // Initial fetch and 10-second polling fallback
  useEffect(() => {
    let isMounted = true;
    async function loadInitial() {
      try {
        const [ordersRes, serviceRes] = await Promise.all([
          fetch("/api/staff/orders"),
          fetch("/api/staff/service-requests"),
        ]);

        if (ordersRes.ok && isMounted) {
          const data = (await ordersRes.json()) as { orders?: KitchenOrder[] };
          if (data.orders) {
            setOrders((prev) => {
              const incoming = data.orders || [];
              const map = new Map<string, KitchenOrder>();
              for (const o of prev) map.set(o.id, o);
              for (const o of incoming) map.set(o.id, o);
              return Array.from(map.values());
            });
            setLastRefreshed(new Date());
          }
        }

        if (serviceRes.ok && isMounted) {
          const data = (await serviceRes.json()) as { serviceRequests?: ServiceRequest[] };
          if (data.serviceRequests) {
            setServiceRequests(data.serviceRequests);
          }
        }
      } catch {
        // Silently continue
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadInitial();
    const interval = setInterval(loadInitial, 10000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const handleStatusChange = async (orderId: string, newStatus: string, reason?: string) => {
    if (updatingId === orderId) return; // Prevent double clicks
    setUpdatingId(orderId);
    try {
      const res = await fetch(`/api/staff/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus, reason }),
      });

      const resData = (await res.json()) as {
        success?: boolean;
        error?: string;
        code?: string;
        order?: Partial<KitchenOrder>;
      };

      if (!res.ok) {
        if (res.status === 409) {
          // Concurrency conflict or illegal transition
          toast.error(resData.error || "Conflict: order was modified by another staff member.");
          if (resData.order) {
            setOrders((prev) =>
              prev.map((o) => (o.id === orderId ? { ...o, ...resData.order } : o))
            );
          } else {
            fetchOrders(false);
          }
        } else {
          toast.error(resData.error || "Failed to update order status");
        }
        return;
      }

      if (resData.order) {
        setOrders((prev) =>
          prev.map((o) => (o.id === orderId ? { ...o, ...resData.order } : o))
        );
      }
      toast.success(`Order status updated to ${newStatus}`);

      // Close cancellation modal if open
      if (cancellingOrder?.id === orderId) {
        setCancellingOrder(null);
        setCancellationReason("");
      }
    } catch {
      toast.error("Network error updating status");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleServiceStatusChange = async (
    requestId: string,
    newStatus: "ACKNOWLEDGED" | "RESOLVED",
    expectedStatus: "OPEN" | "ACKNOWLEDGED"
  ) => {
    if (updatingServiceId === requestId) return;
    setUpdatingServiceId(requestId);
    try {
      const res = await fetch(`/api/staff/service-requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus, expectedStatus }),
      });
      const data = (await res.json()) as { error?: string; request?: ServiceRequest };

      if (!res.ok) {
        if (res.status === 409) {
          toast.error(data.error || "Conflict: Request was already updated by another staff member.");
          fetchServiceRequests();
        } else {
          toast.error(data.error || "Failed to update service request.");
        }
        return;
      }

      if (data.request) {
        setServiceRequests((prev) =>
          prev.map((r) => (r.id === requestId ? (data.request as ServiceRequest) : r))
        );
      } else {
        fetchServiceRequests();
      }
      toast.success(
        newStatus === "ACKNOWLEDGED"
          ? "Service request acknowledged"
          : "Service request resolved"
      );
    } catch {
      toast.error("Network error updating request");
    } finally {
      setUpdatingServiceId(null);
    }
  };

  // Queue Counts
  const activeCount = orders.filter(
    (o) => o.status === "PENDING" || o.status === "NEW" || o.status === "PREPARING"
  ).length;
  const newCount = orders.filter((o) => o.status === "PENDING" || o.status === "NEW").length;
  const preparingCount = orders.filter((o) => o.status === "PREPARING").length;
  const deliveredCount = orders.filter((o) => o.status === "DELIVERED").length;
  const cancelledCount = orders.filter((o) => o.status === "CANCELLED").length;

  // Filtered & Sorted orders
  const filteredOrders = useMemo(() => {
    let list: KitchenOrder[] = [];
    if (filter === "ACTIVE") {
      list = orders.filter((o) => o.status === "PENDING" || o.status === "NEW" || o.status === "PREPARING");
    } else if (filter === "NEW") {
      list = orders.filter((o) => o.status === "PENDING" || o.status === "NEW");
    } else if (filter === "PREPARING") {
      list = orders.filter((o) => o.status === "PREPARING");
    } else if (filter === "DELIVERED") {
      list = orders.filter((o) => o.status === "DELIVERED");
    } else if (filter === "CANCELLED") {
      list = orders.filter((o) => o.status === "CANCELLED");
    } else {
      list = orders;
    }

    // Operational Sorting:
    // For active/new/prep queues, prioritize oldest active orders first (FIFO).
    // For delivered/cancelled/all, show newest first.
    if (filter === "ACTIVE" || filter === "NEW" || filter === "PREPARING") {
      return [...list].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    }
    return [...list].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [orders, filter]);

  // Active Service Requests (sorted FIFO by created_at ASC)
  const activeServiceRequests = useMemo(() => {
    return serviceRequests
      .filter((r) => r.status === "OPEN" || r.status === "ACKNOWLEDGED")
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }, [serviceRequests]);

  return (
    <div className="space-y-6">
      {/* Realtime Service Request Alert Banner */}
      {newServiceAlert && (
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-amber-950 via-stone-900 to-stone-900 border-2 border-amber-400 p-4 sm:p-5 shadow-2xl shadow-amber-500/20 transition-all animate-in fade-in slide-in-from-top-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-amber-400 text-stone-950 flex items-center justify-center shrink-0 shadow-lg shadow-amber-400/30">
                <Bell className="w-5 h-5 animate-bounce" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-extrabold text-white text-base sm:text-lg">
                    Customer Assistance Requested!
                  </span>
                  <span className="bg-amber-400 text-stone-950 font-bold text-xs px-2.5 py-0.5 rounded-md">
                    {newServiceAlert.requestType}
                  </span>
                  <span className="text-xs font-bold text-amber-300 bg-amber-500/20 border border-amber-500/30 px-2.5 py-0.5 rounded-full">
                    Table {newServiceAlert.tableNumber}
                  </span>
                </div>
                {newServiceAlert.note && (
                  <p className="text-xs sm:text-sm text-stone-300 mt-1 italic">
                    &ldquo;{newServiceAlert.note}&rdquo;
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 self-end sm:self-center">
              <span className="text-xs text-amber-400 font-mono bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded-lg">
                {now > 0 ? `${Math.max(0, Math.floor((now - newServiceAlert.createdAt) / 1000))}s ago` : "Just now"}
              </span>
              <button
                onClick={() => setNewServiceAlert(null)}
                className="px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-white text-xs font-semibold rounded-xl border border-stone-700 transition-colors flex items-center gap-1.5 cursor-pointer"
                title="Dismiss alert"
              >
                <X className="w-3.5 h-3.5" />
                <span>Dismiss</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Realtime New Order Notification Banner */}
      {newOrderAlert && (
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-amber-950/70 via-stone-900/90 to-stone-900 border-2 border-amber-500/70 p-4 sm:p-5 shadow-2xl shadow-amber-500/10 transition-all animate-in fade-in slide-in-from-top-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-amber-500 text-stone-950 flex items-center justify-center shrink-0 shadow-lg shadow-amber-500/30">
                <Bell className="w-5 h-5 animate-bounce" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-extrabold text-white text-base sm:text-lg">
                    New Order Received!
                  </span>
                  <span className="bg-amber-400 text-stone-950 font-mono font-bold text-xs px-2.5 py-0.5 rounded-md">
                    {newOrderAlert.orderNumber}
                  </span>
                  <span className="text-xs font-bold text-amber-300 bg-amber-500/20 border border-amber-500/30 px-2.5 py-0.5 rounded-full">
                    Table {newOrderAlert.tableNumber}
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-stone-300 mt-1">
                  <span className="font-semibold text-white">{newOrderAlert.itemCount} {newOrderAlert.itemCount === 1 ? "item" : "items"}:</span>{" "}
                  {newOrderAlert.itemsSummary}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 self-end sm:self-center">
              <span className="text-xs text-amber-400 font-mono bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded-lg">
                {now > 0 ? `${Math.max(0, Math.floor((now - newOrderAlert.createdAt) / 1000))}s ago` : "Just now"}
              </span>
              <button
                onClick={() => setNewOrderAlert(null)}
                className="px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-white text-xs font-semibold rounded-xl border border-stone-700 transition-colors flex items-center gap-1.5 cursor-pointer"
                title="Dismiss alert"
              >
                <X className="w-3.5 h-3.5" />
                <span>Dismiss</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active Service Requests / Table Assistance Panel */}
      {activeServiceRequests.length > 0 && (
        <section className="bg-gradient-to-r from-stone-900 via-amber-950/40 to-stone-900 border-2 border-amber-500/70 rounded-2xl p-4 sm:p-5 shadow-xl shadow-amber-950/30 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center justify-between gap-3 mb-3 border-b border-stone-800/80 pb-2.5">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
              </span>
              <h2 className="font-extrabold text-white text-base tracking-wide flex items-center gap-2">
                Table Assistance Needed
                <span className="bg-amber-500 text-stone-950 text-xs px-2 py-0.5 rounded-full font-mono font-bold">
                  {activeServiceRequests.length}
                </span>
              </h2>
            </div>
            <span className="text-xs text-stone-400">Oldest first (FIFO)</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {activeServiceRequests.map((req) => {
              const elapsedMinutes =
                now > 0 ? Math.floor((now - new Date(req.created_at).getTime()) / 60000) : 0;
              const isUrgent = elapsedMinutes >= 3;
              const isAcknowledged = req.status === "ACKNOWLEDGED";

              return (
                <div
                  key={req.id}
                  className={`bg-stone-950/90 border rounded-xl p-3.5 flex flex-col justify-between gap-3 transition-all ${
                    isUrgent
                      ? "border-rose-500/80 shadow-md shadow-rose-950/30 ring-1 ring-rose-500/40"
                      : isAcknowledged
                        ? "border-sky-500/40 bg-sky-950/10"
                        : "border-amber-500/40 bg-amber-950/10"
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-white text-base">
                          Table {req.tables?.table_number ?? req.table_number ?? "—"}
                        </span>
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-stone-800 text-stone-300">
                          {SERVICE_REQUEST_TYPE_LABELS[req.request_type] ?? req.request_type}
                        </span>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          isAcknowledged
                            ? "bg-sky-500/20 text-sky-300 border-sky-500/40"
                            : "bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse"
                        }`}
                      >
                        {req.status}
                      </span>
                    </div>

                    {req.note && (
                      <p className="mt-2 text-xs text-amber-200/90 bg-stone-900/80 border border-stone-800 rounded-lg p-2 italic">
                        &ldquo;{req.note}&rdquo;
                      </p>
                    )}

                    <div className="mt-2 flex items-center gap-2 text-[11px] text-stone-400">
                      <Clock className="w-3 h-3 text-stone-500" />
                      <span className={isUrgent ? "text-rose-400 font-bold" : ""}>
                        {elapsedMinutes <= 0 ? "Just now" : `${elapsedMinutes}m ago`}
                        {isUrgent && " (Pending attention)"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1 border-t border-stone-800/80">
                    {!isAcknowledged ? (
                      <>
                        <button
                          onClick={() => handleServiceStatusChange(req.id, "ACKNOWLEDGED", "OPEN")}
                          disabled={updatingServiceId === req.id}
                          className="flex-1 bg-sky-600 hover:bg-sky-500 text-white font-bold py-1.5 px-2.5 rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          {updatingServiceId === req.id ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <Check className="w-3 h-3" />
                          )}
                          <span>Acknowledge</span>
                        </button>
                        <button
                          onClick={() => handleServiceStatusChange(req.id, "RESOLVED", "OPEN")}
                          disabled={updatingServiceId === req.id}
                          className="flex-1 bg-emerald-700 hover:bg-emerald-600 text-white font-bold py-1.5 px-2.5 rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Resolve</span>
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() =>
                          handleServiceStatusChange(req.id, "RESOLVED", "ACKNOWLEDGED")
                        }
                        disabled={updatingServiceId === req.id}
                        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-1.5 px-2.5 rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        {updatingServiceId === req.id ? (
                          <RefreshCw className="w-3 h-3 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        )}
                        <span>Mark Resolved</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Phase 8: Table Sessions & Billing Panel */}
      <TableSessionsPanel onSessionClosed={() => fetchOrders(false)} />

      {/* Control bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-stone-900/80 border border-stone-800 p-4 rounded-2xl">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex bg-stone-950 p-1 rounded-xl border border-stone-800 text-xs font-medium flex-wrap gap-1">
            <button
              onClick={() => setFilter("ACTIVE")}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                filter === "ACTIVE"
                  ? "bg-amber-500 text-stone-950 font-bold shadow"
                  : "text-stone-400 hover:text-white"
              }`}
            >
              Active Queue ({activeCount})
            </button>
            <button
              onClick={() => setFilter("NEW")}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                filter === "NEW"
                  ? "bg-amber-500 text-stone-950 font-bold shadow"
                  : "text-stone-400 hover:text-white"
              }`}
            >
              New ({newCount})
            </button>
            <button
              onClick={() => setFilter("PREPARING")}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                filter === "PREPARING"
                  ? "bg-amber-500 text-stone-950 font-bold shadow"
                  : "text-stone-400 hover:text-white"
              }`}
            >
              Preparing ({preparingCount})
            </button>
            <button
              onClick={() => setFilter("DELIVERED")}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                filter === "DELIVERED"
                  ? "bg-amber-500 text-stone-950 font-bold shadow"
                  : "text-stone-400 hover:text-white"
              }`}
            >
              Delivered ({deliveredCount})
            </button>
            <button
              onClick={() => setFilter("CANCELLED")}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                filter === "CANCELLED"
                  ? "bg-amber-500 text-stone-950 font-bold shadow"
                  : "text-stone-400 hover:text-white"
              }`}
            >
              Cancelled ({cancelledCount})
            </button>
            <button
              onClick={() => setFilter("ALL")}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                filter === "ALL"
                  ? "bg-amber-500 text-stone-950 font-bold shadow"
                  : "text-stone-400 hover:text-white"
              }`}
            >
              All ({orders.length})
            </button>
          </div>

          {/* Realtime Status Indicator */}
          {realtimeStatus === "connected" ? (
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium"
              title="Supabase Realtime active: New orders will arrive immediately"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="hidden md:inline">Realtime Active</span>
            </div>
          ) : realtimeStatus === "connecting" ? (
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-medium"
              title="Connecting to Supabase Realtime..."
            >
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              <span className="hidden md:inline">Connecting Realtime...</span>
            </div>
          ) : (
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-stone-800/80 border border-stone-700 text-stone-400 text-xs font-medium"
              title="Realtime offline. Polling fallback active (10s)"
            >
              <span className="w-2 h-2 rounded-full bg-stone-500" />
              <span className="hidden md:inline">Polling Fallback (10s)</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setSoundEnabled((prev) => {
                const next = !prev;
                if (next) {
                  try {
                    playKitchenAlert("BELL");
                    toast.success("Sound alerts enabled");
                  } catch {
                    toast.error("Audio blocked by browser. Please interact with page.");
                  }
                } else {
                  toast.info("Sound alerts muted");
                }
                return next;
              });
            }}
            className={`p-2 rounded-xl border text-xs flex items-center gap-1.5 transition-colors cursor-pointer ${
              soundEnabled
                ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                : "bg-stone-950 border-stone-800 text-stone-400 hover:text-white"
            }`}
            title={soundEnabled ? "Mute audio alerts" : "Enable audio alerts"}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            <span className="hidden sm:inline">{soundEnabled ? "Audio On" : "Muted"}</span>
          </button>

          <button
            onClick={() => {
              fetchOrders(true);
              fetchServiceRequests();
            }}
            disabled={loading}
            className="p-2 bg-stone-950 hover:bg-stone-800 border border-stone-800 text-stone-300 rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Refresh order queue"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-amber-500" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <span className="text-[11px] text-stone-400">
            Updated {lastRefreshed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      </div>

      {/* Orders Grid */}
      {filteredOrders.length === 0 ? (
        <div className="bg-stone-900/50 border border-stone-800 rounded-2xl p-12 text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-stone-800/80 text-stone-400 flex items-center justify-center mx-auto">
            <ChefHat className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-bold text-white">No orders in this queue</h3>
          <p className="text-xs text-stone-400 max-w-sm mx-auto">
            {filter === "ACTIVE"
              ? "Kitchen queue is clear! New table orders will appear here automatically."
              : `No orders found matching the '${filter}' filter.`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredOrders.map((order) => {
            const isPending = order.status === "PENDING" || order.status === "NEW";
            const isPreparing = order.status === "PREPARING";
            const isDelivered = order.status === "DELIVERED";
            const isCancelled = order.status === "CANCELLED";

            const elapsedMinutes =
              now > 0
                ? Math.floor((now - new Date(order.created_at).getTime()) / (1000 * 60))
                : 0;

            const isUrgent = (isPending || isPreparing) && elapsedMinutes >= 15;

            return (
              <div
                key={order.id}
                className={`bg-stone-900 border rounded-2xl p-5 flex flex-col justify-between transition-all shadow-lg ${
                  isUrgent
                    ? "border-rose-500/80 shadow-rose-500/10 ring-1 ring-rose-500/30"
                    : isPending
                      ? "border-amber-500/50 shadow-amber-500/5"
                      : isPreparing
                        ? "border-blue-500/50 shadow-blue-500/5"
                        : isDelivered
                          ? "border-emerald-500/30 opacity-80"
                          : "border-stone-800 opacity-60"
                }`}
              >
                <div className="space-y-4">
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-3 border-b border-stone-800 pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-lg">
                          Table {order.tables?.table_number ?? "—"}
                        </span>
                        <span className="text-xs font-mono text-amber-400 font-semibold bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                          {order.order_number || `#${order.id.slice(0, 4)}`}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-stone-400">
                        {order.customer_name && (
                          <span className="flex items-center gap-1 text-stone-300">
                            <User className="w-3 h-3 text-stone-400" />
                            {order.customer_name}
                          </span>
                        )}
                        <span>•</span>
                        <span
                          className={`flex items-center gap-1 font-medium ${
                            isUrgent ? "text-rose-400 font-bold animate-pulse" : ""
                          }`}
                        >
                          <Clock className="w-3 h-3" />
                          {elapsedMinutes <= 0
                            ? "Just now"
                            : `${elapsedMinutes}m ago${isUrgent ? " (Delayed)" : ""}`}
                        </span>
                      </div>
                    </div>

                    <span
                      className={`text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${
                        isPending
                          ? "bg-amber-500/10 text-amber-400 border-amber-500/30 animate-pulse"
                          : isPreparing
                            ? "bg-blue-500/10 text-blue-400 border-blue-500/30"
                            : isDelivered
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                              : "bg-red-500/10 text-red-400 border-red-500/30"
                      }`}
                    >
                      {order.status === "PENDING" ? "NEW" : order.status}
                    </span>
                  </div>

                  {/* Order Items */}
                  <div className="space-y-2">
                    {order.order_items?.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-start justify-between text-sm py-1 border-b border-stone-800/50 last:border-0"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-amber-400 w-5 text-right">
                              {item.quantity}×
                            </span>
                            <span className="font-medium text-stone-100">{item.item_name}</span>
                          </div>
                          {item.customization_notes && (
                            <p className="text-xs text-stone-400 pl-7 italic">
                              &ldquo;{item.customization_notes}&rdquo;
                            </p>
                          )}
                        </div>
                        <span className="text-xs text-stone-400 font-mono">
                          {formatINR(Number(item.unit_price_inr) * item.quantity)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Order Notes if present */}
                  {order.order_notes && (
                    <div className="bg-stone-950/60 border border-amber-500/20 rounded-xl p-2.5 flex items-start gap-2 text-xs text-amber-300">
                      <FileText className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                      <div>
                        <span className="font-semibold block text-amber-400">Kitchen Note:</span>
                        <span>{order.order_notes}</span>
                      </div>
                    </div>
                  )}

                  {/* Cancellation Reason if present */}
                  {isCancelled && order.cancellation_reason && (
                    <div className="bg-red-950/30 border border-red-500/20 rounded-xl p-2.5 flex items-start gap-2 text-xs text-red-300">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
                      <div>
                        <span className="font-semibold block text-red-400">Cancellation Reason:</span>
                        <span>{order.cancellation_reason}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Card Footer / Actions */}
                <div className="pt-4 mt-4 border-t border-stone-800 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-stone-400">Total in INR</span>
                    <strong className="text-base text-white font-mono">
                      {formatINR(Number(order.total_amount_inr || 0))}
                    </strong>
                  </div>

                  <div className="flex items-center gap-2">
                    {isPending && (
                      <button
                        onClick={() => handleStatusChange(order.id, "PREPARING")}
                        disabled={updatingId === order.id}
                        className="flex-1 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold py-2 px-3 rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        {updatingId === order.id ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <ChefHat className="w-3.5 h-3.5" />
                        )}
                        <span>Start Preparing</span>
                      </button>
                    )}

                    {isPreparing && (
                      <button
                        onClick={() => handleStatusChange(order.id, "DELIVERED")}
                        disabled={updatingId === order.id}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-3 rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        {updatingId === order.id ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        )}
                        <span>Mark Delivered</span>
                      </button>
                    )}

                    {!isDelivered && !isCancelled && (
                      <button
                        onClick={() => setCancellingOrder(order)}
                        disabled={updatingId === order.id}
                        className="px-2.5 py-2 rounded-xl text-xs font-medium text-stone-400 hover:text-red-400 hover:bg-red-500/10 border border-stone-800 transition-colors cursor-pointer disabled:opacity-50"
                        title="Cancel this order"
                      >
                        Cancel
                      </button>
                    )}

                    {isDelivered && (
                      <div className="w-full text-center py-1.5 text-xs text-emerald-400 font-medium flex items-center justify-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Order Completed</span>
                      </div>
                    )}

                    {isCancelled && (
                      <div className="w-full text-center py-1.5 text-xs text-red-400 font-medium flex items-center justify-center gap-1.5">
                        <Ban className="w-4 h-4" />
                        <span>Order Cancelled</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Cancellation Confirmation Modal */}
      {cancellingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-stone-900 border border-stone-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-red-400">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h3 className="font-bold text-white text-base">Cancel Order</h3>
                <p className="text-xs text-stone-400">
                  Table {cancellingOrder.tables?.table_number ?? "—"} • {cancellingOrder.order_number || `#${cancellingOrder.id.slice(0, 4)}`}
                </p>
              </div>
            </div>

            <p className="text-sm text-stone-300">
              Are you sure you want to cancel this order? This action cannot be reversed.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-stone-400">
                Cancellation Reason (Optional):
              </label>
              <input
                type="text"
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                placeholder="e.g., Customer requested, Out of ingredients..."
                className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs text-white placeholder-stone-600 focus:outline-none focus:border-red-500/50"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => {
                  setCancellingOrder(null);
                  setCancellationReason("");
                }}
                disabled={updatingId === cancellingOrder.id}
                className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                Nevermind
              </button>
              <button
                onClick={() =>
                  handleStatusChange(cancellingOrder.id, "CANCELLED", cancellationReason)
                }
                disabled={updatingId === cancellingOrder.id}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shadow-lg shadow-red-600/20 cursor-pointer disabled:opacity-50"
              >
                {updatingId === cancellingOrder.id ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Ban className="w-3.5 h-3.5" />
                )}
                <span>Confirm Cancellation</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
