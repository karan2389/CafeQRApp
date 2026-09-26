"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { RefreshCw, Volume2, VolumeX, Bell, X } from "lucide-react";
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
  // Match server and first client render; the subscription effect resolves status.
  const [realtimeStatus, setRealtimeStatus] = useState<"connected" | "connecting" | "error" | "disconnected">("connecting");
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
        // A full GET is authoritative. Merging it with previous results keeps
        // older orders in the queue after they leave the server's recent list.
        setOrders(data.orders);
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

  useEffect(() => {
    if (!newOrderAlert) return;
    const timer = setTimeout(() => setNewOrderAlert(null), 8000);
    return () => clearTimeout(timer);
  }, [newOrderAlert]);

  useEffect(() => {
    if (!newServiceAlert) return;
    const timer = setTimeout(() => setNewServiceAlert(null), 8000);
    return () => clearTimeout(timer);
  }, [newServiceAlert]);

  // Supabase Realtime Subscription
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      const timer = setTimeout(() => setRealtimeStatus("disconnected"), 0);
      return () => clearTimeout(timer);
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
            setOrders(data.orders);
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

  const renderOrder = (order: KitchenOrder) => {
    const isNew = order.status === "NEW" || order.status === "PENDING";
    const isPreparing = order.status === "PREPARING";
    const ageMinutes = now > 0 ? Math.max(0, Math.floor((now - new Date(order.created_at).getTime()) / 60000)) : 0;
    const orderLabel = order.order_number || `#${order.id.slice(0, 4)}`;
    return (
      <article className="kitchen-order" key={order.id}>
        <div className="kitchen-order-top">
          <div><strong>Table {order.tables?.table_number ?? "—"}</strong><span className="kitchen-order-id">{orderLabel}</span></div>
          <span className={`kitchen-age ${ageMinutes >= 15 && (isNew || isPreparing) ? "is-late" : ""}`}>
            {ageMinutes === 0 ? "Just now" : `${ageMinutes} min`}{ageMinutes >= 15 && (isNew || isPreparing) ? " · delayed" : ""}
          </span>
        </div>
        <div className="kitchen-order-items">
          {order.order_items?.map((item) => (
            <div className="kitchen-item" key={item.id}>
              <span className="kitchen-quantity">{item.quantity} ×</span>
              <div><strong>{item.item_name}</strong>{item.customization_notes && <p className="kitchen-item-note">{item.customization_notes}</p>}</div>
            </div>
          ))}
        </div>
        {order.order_notes && <div className="kitchen-note"><strong>Kitchen note</strong><span>{order.order_notes}</span></div>}
        {order.status === "CANCELLED" && order.cancellation_reason && <div className="kitchen-note"><strong>Cancellation reason</strong><span>{order.cancellation_reason}</span></div>}
        <div className="kitchen-order-foot">
          <span>{formatINR(Number(order.total_amount_inr || 0))} · {isNew ? "New" : isPreparing ? "Preparing" : order.status === "DELIVERED" ? "Delivered" : "Cancelled"}</span>
          {isNew && <button className="kitchen-primary" type="button" onClick={() => handleStatusChange(order.id, "PREPARING")} disabled={updatingId === order.id}>Start preparing</button>}
          {isPreparing && <button className="kitchen-primary is-blue" type="button" onClick={() => handleStatusChange(order.id, "DELIVERED")} disabled={updatingId === order.id}>Mark delivered</button>}
        </div>
        <details className="kitchen-order-details">
          <summary>Order details{(isNew || isPreparing) ? " & options" : ""}</summary>
          <div className="kitchen-order-extra">
            {order.customer_name && <p>Customer: {order.customer_name}</p>}
            <p>Placed: {new Date(order.created_at).toLocaleString()}</p>
            {order.order_items?.map((item) => <p key={item.id}>{item.quantity} × {item.item_name} · {formatINR(Number(item.unit_price_inr) * item.quantity)}</p>)}
            {(isNew || isPreparing) && <button className="kitchen-text-danger" type="button" onClick={() => setCancellingOrder(order)}>Cancel order…</button>}
          </div>
        </details>
      </article>
    );
  };

  const queueIsActive = filter === "ACTIVE";
  const showTwoColumns = queueIsActive;
  const newOrders = filteredOrders.filter((o) => o.status === "NEW" || o.status === "PENDING");
  const preparingOrders = filteredOrders.filter((o) => o.status === "PREPARING");
  const statusText = realtimeStatus === "connected" ? "Live connection" : realtimeStatus === "connecting" ? "Connecting" : "Polling every 10 sec";

  return (
    <div className="kitchen-dashboard">
      <div className="kitchen-dashboard-top">
        <div className="kitchen-dashboard-title"><div><h1>Kitchen overview</h1><p>Current work stays in view as each list grows.</p></div>
          <span className="kitchen-updated">Updated {lastRefreshed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
        </div>
        <div className="kitchen-summary" aria-label="Current workload">
          <button type="button" className={queueIsActive ? "is-selected" : ""} onClick={() => setFilter("ACTIVE")}>Active <strong>{activeCount}</strong></button>
          <button type="button" className={filter === "NEW" ? "is-selected" : ""} onClick={() => setFilter("NEW")}>New <strong>{newCount}</strong></button>
          <button type="button" className={filter === "PREPARING" ? "is-selected" : ""} onClick={() => setFilter("PREPARING")}>Preparing <strong>{preparingCount}</strong></button>
          <span className="kitchen-help-count">Assistance <strong>{activeServiceRequests.length}</strong></span>
          <div className="kitchen-tools">
            <span className={realtimeStatus === "connected" ? "kitchen-connected" : "kitchen-disconnected"}>{statusText}</span>
            <button type="button" onClick={() => setSoundEnabled((prev) => { if (!prev) { try { playKitchenAlert("BELL"); toast.success("Sound alerts enabled"); } catch { toast.error("Audio blocked by browser. Please interact with page."); } } else toast.info("Sound alerts muted"); return !prev; })} aria-label={soundEnabled ? "Mute order sounds" : "Enable order sounds"} title={soundEnabled ? "Mute order sounds" : "Enable order sounds"}>{soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />} <span>{soundEnabled ? "Sound on" : "Muted"}</span></button>
            <button type="button" onClick={() => { fetchOrders(true); fetchServiceRequests(); }} disabled={loading} aria-label="Refresh kitchen orders and requests" title="Refresh kitchen orders and requests"><RefreshCw size={17} /> <span>Refresh</span></button>
          </div>
        </div>
        {(newOrderAlert || newServiceAlert) && <div className="kitchen-alert" role="status">
          <Bell size={17} /><span>{newServiceAlert ? `Table ${newServiceAlert.tableNumber}: ${SERVICE_REQUEST_TYPE_LABELS[newServiceAlert.requestType as ServiceRequestType] ?? newServiceAlert.requestType}` : `New order ${newOrderAlert?.orderNumber} · Table ${newOrderAlert?.tableNumber}`}</span>
          <button type="button" onClick={() => { setNewOrderAlert(null); setNewServiceAlert(null); }} aria-label="Dismiss alert"><X size={18} /></button>
        </div>}
      </div>
      <div className="kitchen-grid">
        <section className={`kitchen-board ${showTwoColumns ? "has-two-queues" : ""}`} aria-label="Kitchen orders">
          {showTwoColumns ? <>
            <div className="kitchen-panel"><div className="kitchen-panel-heading"><h2>New <span>{newCount}</span></h2><small>Oldest first</small></div><div className="kitchen-panel-scroll" role="region" aria-label="New orders" tabIndex={0}>{newOrders.length ? newOrders.map(renderOrder) : <p className="kitchen-empty">{loading ? "Loading new orders…" : "No new orders. Incoming orders will appear here automatically."}</p>}</div></div>
            <div className="kitchen-panel"><div className="kitchen-panel-heading"><h2>Preparing <span>{preparingCount}</span></h2><small>Oldest first</small></div><div className="kitchen-panel-scroll" role="region" aria-label="Preparing orders" tabIndex={0}>{preparingOrders.length ? preparingOrders.map(renderOrder) : <p className="kitchen-empty">{loading ? "Loading preparing orders…" : "Nothing is preparing right now."}</p>}</div></div>
          </> : <div className="kitchen-panel"><div className="kitchen-panel-heading"><h2>{filter === "ALL" ? "All orders" : filter === "NEW" ? "New orders" : filter === "PREPARING" ? "Preparing orders" : filter === "DELIVERED" ? "Delivered orders" : "Cancelled orders"} <span>{filteredOrders.length}</span></h2><small>{filter === "NEW" || filter === "PREPARING" ? "Oldest first" : "Newest first"}</small></div><div className="kitchen-panel-scroll" role="region" aria-label={`${filter.toLowerCase()} orders`} tabIndex={0}>{filteredOrders.length ? filteredOrders.map(renderOrder) : <p className="kitchen-empty">No orders in this view.</p>}</div></div>}
        </section>
        <aside className="kitchen-side" aria-label="Assistance and billing">
          <section className="kitchen-panel"><div className="kitchen-panel-heading"><h2>Table assistance <span>{activeServiceRequests.length}</span></h2><small>Oldest first</small></div><div className="kitchen-panel-scroll" role="region" aria-label="Table assistance requests" tabIndex={0}>
            {activeServiceRequests.length ? activeServiceRequests.map((req) => {
              const elapsed = now > 0 ? Math.max(0, Math.floor((now - new Date(req.created_at).getTime()) / 60000)) : 0;
              const acked = req.status === "ACKNOWLEDGED";
              return <article className="kitchen-request" key={req.id}>
                <div><strong>Table {req.tables?.table_number ?? req.table_number ?? "—"}</strong><span>{acked ? "Acknowledged" : "Open"} · {elapsed} min</span></div>
                <p>{SERVICE_REQUEST_TYPE_LABELS[req.request_type] ?? req.request_type}</p>
                {req.note && <div className="kitchen-note">{req.note}</div>}
                <div className="kitchen-request-actions">{!acked && <button type="button" disabled={updatingServiceId === req.id} onClick={() => handleServiceStatusChange(req.id, "ACKNOWLEDGED", "OPEN")}>Acknowledge</button>}
                  <button type="button" disabled={updatingServiceId === req.id} onClick={() => handleServiceStatusChange(req.id, "RESOLVED", acked ? "ACKNOWLEDGED" : "OPEN")}>Resolve</button></div>
              </article>;
            }) : <p className="kitchen-empty">No tables need assistance.</p>}
          </div></section>
          <TableSessionsPanel onSessionClosed={() => fetchOrders(false)} />
        </aside>
      </div>
      <div className="kitchen-history" aria-label="Order history filters">
        <span>Other views</span>
        <button type="button" className={filter === "DELIVERED" ? "is-selected" : ""} onClick={() => setFilter("DELIVERED")}>Delivered ({deliveredCount})</button>
        <button type="button" className={filter === "CANCELLED" ? "is-selected" : ""} onClick={() => setFilter("CANCELLED")}>Cancelled ({cancelledCount})</button>
        <button type="button" className={filter === "ALL" ? "is-selected" : ""} onClick={() => setFilter("ALL")}>All ({orders.length})</button>
      </div>
      {cancellingOrder && <div className="kitchen-modal-overlay" role="presentation"><div className="kitchen-modal" role="dialog" aria-modal="true" aria-labelledby="kitchen-cancel-heading">
        <h2 id="kitchen-cancel-heading">Cancel order {cancellingOrder.order_number || `#${cancellingOrder.id.slice(0, 4)}`}?</h2>
        <p>Table {cancellingOrder.tables?.table_number ?? "—"}. This action cannot be reversed.</p>
        <label htmlFor="kitchen-cancellation-reason">Cancellation reason (optional)</label>
        <input id="kitchen-cancellation-reason" type="text" value={cancellationReason} onChange={(e) => setCancellationReason(e.target.value)} placeholder="Customer requested, out of ingredients…" />
        <div className="kitchen-modal-actions"><button type="button" disabled={updatingId === cancellingOrder.id} onClick={() => { setCancellingOrder(null); setCancellationReason(""); }}>Back</button><button type="button" className="is-danger" disabled={updatingId === cancellingOrder.id} onClick={() => handleStatusChange(cancellingOrder.id, "CANCELLED", cancellationReason)}>Confirm cancellation</button></div>
      </div></div>}
    </div>
  );
}
