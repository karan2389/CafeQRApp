"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { RefreshCw, Volume2, VolumeX, Bell, X } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatINR } from "@/lib/format";
import { playKitchenAlert } from "@/features/kitchen/kitchen-sound";
import {
  playKitchenVoiceAlert,
  selectPendingReminder,
  stopKitchenVoiceAlerts,
  type KitchenVoiceKind,
  type ReminderCandidate,
} from "@/features/kitchen/kitchen-voice-alert";
import type { ServiceRequest, ServiceRequestStatus } from "@/types";
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
  // 1. Reactive Queries from Convex
  const queueData = useQuery(api.kitchen.getActiveKitchenQueue);
  const metricsData = useQuery(api.kitchen.getKitchenMetrics);
  const serviceRequestsData = useQuery(api.service_requests.getActiveServiceRequests);

  // 2. Mutations from Convex
  const updateOrderStatusMutation = useMutation(api.kitchen.updateOrderStatus);
  const acknowledgeServiceMutation = useMutation(api.service_requests.acknowledgeServiceRequest);
  const resolveServiceMutation = useMutation(api.service_requests.resolveServiceRequest);

  const [filter, setFilter] = useState<QueueFilter>("ACTIVE");
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [updatingServiceId, setUpdatingServiceId] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(() => new Date());
  const [now, setNow] = useState<number>(() => (typeof window !== "undefined" ? Date.now() : 0));
  const [newOrderAlert, setNewOrderAlert] = useState<NewOrderAlertInfo | null>(null);

  // Cancellation modal state
  const [cancellingOrder, setCancellingOrder] = useState<KitchenOrder | null>(null);
  const [cancellationReason, setCancellationReason] = useState("");

  const soundEnabledRef = useRef(soundEnabled);
  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  const playedAudioOrderIds = useRef<Set<string>>(new Set());
  const seenOrderIds = useRef<Set<string>>(new Set());
  const ordersLoaded = useRef(false);

  const playedAudioServiceIds = useRef<Set<string>>(new Set());
  const seenServiceIds = useRef<Set<string>>(new Set());
  const serviceLoaded = useRef(false);
  const lastReminderAt = useRef<Map<string, number>>(new Map());
  const nextReminderSlot = useRef(0);

  // Map Convex Queue into Domain KitchenOrder models
  const orders: KitchenOrder[] = useMemo(() => {
    if (!queueData) return [];
    const all = [
      ...queueData.newOrders,
      ...queueData.preparingOrders,
      ...queueData.recentDeliveredOrders,
    ];

    return all.map((o) => {
      let mappedStatus: "PENDING" | "NEW" | "PREPARING" | "DELIVERED" | "CANCELLED" = "NEW";
      if (o.status === "PREPARING") mappedStatus = "PREPARING";
      else if (o.status === "DELIVERED" || o.status === "PAID") mappedStatus = "DELIVERED";
      else if (o.status === "CANCELLED") mappedStatus = "CANCELLED";

      return {
        id: o._id,
        order_number: o.orderNumber,
        customer_name: o.customerName ?? null,
        order_notes: o.orderNotes ?? null,
        total_amount_inr: o.totalAmountPaise / 100,
        status: mappedStatus,
        cancellation_reason: o.cancellationReason ?? null,
        created_at: new Date(o.placedAt).toISOString(),
        updated_at: new Date(o.statusUpdatedAt).toISOString(),
        tables: {
          id: o.tableId,
          table_number: o.tableNumber,
          display_name: `Table ${o.tableNumber}`,
        },
        order_items: o.items.map((i) => ({
          id: i._id,
          item_name: i.itemName,
          unit_price_inr: i.unitPricePaise / 100,
          quantity: i.quantity,
          customization_notes: i.customizationNotes ?? null,
        })),
      };
    });
  }, [queueData]);

  // Map Convex Service Requests
  const serviceRequests: ServiceRequest[] = useMemo(() => {
    if (!serviceRequestsData) return [];
    return serviceRequestsData.map((r) => ({
      id: r._id,
      table_id: r.tableId,
      table_number: r.tableNumber,
      table_order_session_id: r.tableOrderSessionId,
      request_type: r.requestType,
      note: r.note ?? null,
      status: r.status as ServiceRequestStatus,
      created_at: new Date(r.createdAt).toISOString(),
      acknowledged_at: r.acknowledgedAt ? new Date(r.acknowledgedAt).toISOString() : null,
      resolved_at: null,
      updated_at: new Date(r.updatedAt).toISOString(),
      tables: {
        id: r.tableId,
        table_number: r.tableNumber,
        display_name: `Table ${r.tableNumber}`,
      },
    }));
  }, [serviceRequestsData]);

  const recentOrdersRef = useRef(orders);
  const recentServiceRequestsRef = useRef(serviceRequests);
  useEffect(() => {
    recentOrdersRef.current = orders;
  }, [orders]);
  useEffect(() => {
    recentServiceRequestsRef.current = serviceRequests;
  }, [serviceRequests]);

  const announceOrder = useCallback((order: KitchenOrder) => {
    if (soundEnabledRef.current && !playedAudioOrderIds.current.has(order.id)) {
      if (playKitchenVoiceAlert("NEW_ORDER", order.tables?.table_number ?? null)) {
        playedAudioOrderIds.current.add(order.id);
      }
    }
    const itemCount = order.order_items?.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
    setNewOrderAlert({
      id: order.id,
      orderId: order.id,
      orderNumber: order.order_number || `#${order.id.slice(0, 4)}`,
      tableNumber: order.tables?.table_number ?? "—",
      itemCount,
      itemsSummary: order.order_items?.map((item) => `${item.quantity}× ${item.item_name}`).join(", ") ?? "",
      createdAt: Date.now(),
    });
    toast.info(`New order ${order.order_number || ""} from Table ${order.tables?.table_number ?? "—"}`);
  }, []);

  const announceService = useCallback((request: ServiceRequest) => {
    if (request.status !== "OPEN") return;
    const tableNumber = request.tables?.table_number ?? request.table_number ?? "—";
    const label = SERVICE_REQUEST_TYPE_LABELS[request.request_type] ?? "Staff Assistance";
    if (soundEnabledRef.current && !playedAudioServiceIds.current.has(request.id)) {
      if (playKitchenVoiceAlert(request.request_type as KitchenVoiceKind, tableNumber)) {
        playedAudioServiceIds.current.add(request.id);
      }
    }
    toast.info(`Table ${tableNumber}: ${label} requested`, { duration: 8000 });
  }, []);

  // Audio trigger on reactive updates: skips initial existing orders, fires on new arrivals
  useEffect(() => {
    if (!orders.length && !ordersLoaded.current) return;
    const firstLoad = !ordersLoaded.current;
    ordersLoaded.current = true;

    for (const order of orders) {
      if (!seenOrderIds.current.has(order.id)) {
        seenOrderIds.current.add(order.id);
        if (!firstLoad && (order.status === "NEW" || order.status === "PENDING")) {
          announceOrder(order);
        }
      }
    }
    setLastRefreshed(new Date());
  }, [orders, announceOrder]);

  // Audio trigger on reactive service requests
  useEffect(() => {
    if (!serviceRequests.length && !serviceLoaded.current) return;
    const firstLoad = !serviceLoaded.current;
    serviceLoaded.current = true;

    for (const request of serviceRequests) {
      if (!seenServiceIds.current.has(request.id)) {
        seenServiceIds.current.add(request.id);
        if (!firstLoad && request.status === "OPEN") {
          announceService(request);
        }
      }
    }
  }, [serviceRequests, announceService]);

  // Timer for relative time computation
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Alert banner auto-dismissal
  useEffect(() => {
    if (!newOrderAlert) return;
    const timer = setTimeout(() => setNewOrderAlert(null), 8000);
    return () => clearTimeout(timer);
  }, [newOrderAlert]);

  // Periodic Reminder Loop for Overdue Orders & Requests
  const checkPendingReminders = useCallback(() => {
    if (!soundEnabledRef.current) return;
    const time = Date.now();
    const candidates: ReminderCandidate[] = [
      ...recentOrdersRef.current.map((order) => ({
        key: `order:${order.id}`,
        kind: "PENDING_ORDER" as const,
        status: order.status,
        createdAt: order.created_at,
        tableNumber: order.tables?.table_number ?? null,
      })),
      ...recentServiceRequestsRef.current.map((request) => ({
        key: `request:${request.id}`,
        kind: "UNANSWERED_REQUEST" as const,
        status: request.status,
        createdAt: request.created_at,
        tableNumber: request.tables?.table_number ?? request.table_number ?? null,
      })),
    ];

    const waitingKeys = new Set(
      candidates
        .filter((c) =>
          c.kind === "PENDING_ORDER"
            ? c.status === "NEW" || c.status === "PENDING"
            : c.status === "OPEN"
        )
        .map((c) => c.key)
    );

    for (const key of lastReminderAt.current.keys()) {
      if (!waitingKeys.has(key)) lastReminderAt.current.delete(key);
    }

    if (time < nextReminderSlot.current) return;
    const reminder = selectPendingReminder(candidates, lastReminderAt.current, time);
    if (!reminder || !playKitchenVoiceAlert(reminder.kind, reminder.tableNumber)) return;

    lastReminderAt.current.set(reminder.key, time);
    nextReminderSlot.current = time + 15_000;
    toast.warning(
      `${reminder.kind === "PENDING_ORDER" ? "Pending order" : "Unanswered request"} · Table ${
        reminder.tableNumber ?? "—"
      }`,
      { duration: 8000 }
    );
  }, []);

  useEffect(() => {
    const interval = setInterval(checkPendingReminders, 15_000);
    return () => clearInterval(interval);
  }, [checkPendingReminders]);

  useEffect(() => {
    if (!soundEnabled) return;
    const timer = setTimeout(checkPendingReminders, 500);
    return () => clearTimeout(timer);
  }, [soundEnabled, checkPendingReminders]);

  useEffect(() => () => stopKitchenVoiceAlerts(), []);

  // Status transitions mediated by Convex
  const handleStatusChange = async (
    orderId: string,
    newStatus: "PREPARING" | "DELIVERED" | "CANCELLED",
    reason?: string
  ) => {
    if (updatingId === orderId) return;
    setUpdatingId(orderId);

    try {
      await updateOrderStatusMutation({
        orderId: orderId as Id<"orders">,
        targetStatus: newStatus,
        cancellationReason: reason?.trim() || undefined,
      });

      toast.success(`Order updated to ${newStatus}`);
      if (cancellingOrder?.id === orderId) {
        setCancellingOrder(null);
        setCancellationReason("");
      }
    } catch (err: unknown) {
      console.error("[KitchenStatus] Mutation failed:", err);
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg || "Failed to update order status");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleServiceStatusChange = async (
    requestId: string,
    action: "ACKNOWLEDGE" | "RESOLVE"
  ) => {
    if (updatingServiceId === requestId) return;
    setUpdatingServiceId(requestId);

    try {
      if (action === "ACKNOWLEDGE") {
        await acknowledgeServiceMutation({
          requestId: requestId as Id<"serviceRequests">,
        });
        toast.success("Service request acknowledged");
      } else {
        await resolveServiceMutation({
          requestId: requestId as Id<"serviceRequests">,
        });
        toast.success("Service request resolved");
      }
    } catch (err: unknown) {
      console.error("[KitchenService] Action failed:", err);
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg || "Failed to update service request");
    } finally {
      setUpdatingServiceId(null);
    }
  };

  // Queue Counts
  const activeCount =
    metricsData?.activeOrdersCount ??
    orders.filter((o) => o.status === "NEW" || o.status === "PENDING" || o.status === "PREPARING")
      .length;
  const newCount =
    metricsData?.newOrdersCount ??
    orders.filter((o) => o.status === "NEW" || o.status === "PENDING").length;
  const preparingCount =
    metricsData?.preparingOrdersCount ??
    orders.filter((o) => o.status === "PREPARING").length;
  const deliveredCount =
    metricsData?.deliveredOrdersCount ??
    orders.filter((o) => o.status === "DELIVERED").length;
  const cancelledCount = orders.filter((o) => o.status === "CANCELLED").length;

  // Filtered & Sorted orders
  const filteredOrders = useMemo(() => {
    let list: KitchenOrder[] = [];
    if (filter === "ACTIVE") {
      list = orders.filter((o) => o.status === "NEW" || o.status === "PENDING" || o.status === "PREPARING");
    } else if (filter === "NEW") {
      list = orders.filter((o) => o.status === "NEW" || o.status === "PENDING");
    } else if (filter === "PREPARING") {
      list = orders.filter((o) => o.status === "PREPARING");
    } else if (filter === "DELIVERED") {
      list = orders.filter((o) => o.status === "DELIVERED");
    } else if (filter === "CANCELLED") {
      list = orders.filter((o) => o.status === "CANCELLED");
    } else {
      list = orders;
    }

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

  const toggleSound = () => {
    const enabled = !soundEnabledRef.current;
    soundEnabledRef.current = enabled;
    setSoundEnabled(enabled);
    if (enabled) {
      try {
        playKitchenAlert("BELL");
        toast.success("Voice alerts enabled");
      } catch {
        toast.error("Audio was blocked by the browser. Please interact with this page again.");
      }
    } else {
      stopKitchenVoiceAlerts();
      toast.info("Voice alerts muted");
    }
  };

  const renderOrder = (order: KitchenOrder) => {
    const isNew = order.status === "NEW" || order.status === "PENDING";
    const isPreparing = order.status === "PREPARING";
    const ageMinutes =
      now > 0 ? Math.max(0, Math.floor((now - new Date(order.created_at).getTime()) / 60000)) : 0;
    const isLate = (isNew && ageMinutes >= 10) || (isPreparing && ageMinutes >= 15);
    const orderLabel = order.order_number || `#${order.id.slice(0, 4)}`;

    return (
      <article className="kitchen-order" key={order.id}>
        <div className="kitchen-order-top">
          <div>
            <strong>Table {order.tables?.table_number ?? "—"}</strong>
            <span className="kitchen-order-id">{orderLabel}</span>
          </div>
          <span className={`kitchen-age ${isLate ? "is-late" : ""}`}>
            {ageMinutes === 0 ? "Just now" : `${ageMinutes} min`}
            {isLate ? " · delayed" : ""}
          </span>
        </div>
        <div className="kitchen-order-items">
          {order.order_items?.map((item) => (
            <div className="kitchen-item" key={item.id}>
              <span className="kitchen-quantity">{item.quantity} ×</span>
              <div>
                <strong>{item.item_name}</strong>
                {item.customization_notes && (
                  <p className="kitchen-item-note">{item.customization_notes}</p>
                )}
              </div>
            </div>
          ))}
        </div>
        {order.order_notes && (
          <div className="kitchen-note">
            <strong>Kitchen note</strong>
            <span>{order.order_notes}</span>
          </div>
        )}
        {order.status === "CANCELLED" && order.cancellation_reason && (
          <div className="kitchen-note">
            <strong>Cancellation reason</strong>
            <span>{order.cancellation_reason}</span>
          </div>
        )}
        <div className="kitchen-order-foot">
          <span>
            {formatINR(Number(order.total_amount_inr || 0))} ·{" "}
            {isNew
              ? "New"
              : isPreparing
              ? "Preparing"
              : order.status === "DELIVERED"
              ? "Delivered"
              : "Cancelled"}
          </span>
          {isNew && (
            <button
              className="kitchen-primary"
              type="button"
              onClick={() => handleStatusChange(order.id, "PREPARING")}
              disabled={updatingId === order.id}
            >
              Start preparing
            </button>
          )}
          {isPreparing && (
            <button
              className="kitchen-primary is-blue"
              type="button"
              onClick={() => handleStatusChange(order.id, "DELIVERED")}
              disabled={updatingId === order.id}
            >
              Mark delivered
            </button>
          )}
        </div>
        <details className="kitchen-order-details">
          <summary>Order details{isNew || isPreparing ? " & options" : ""}</summary>
          <div className="kitchen-order-extra">
            {order.customer_name && <p>Customer: {order.customer_name}</p>}
            <p>Placed: {new Date(order.created_at).toLocaleString()}</p>
            {order.order_items?.map((item) => (
              <p key={item.id}>
                {item.quantity} × {item.item_name} ·{" "}
                {formatINR(Number(item.unit_price_inr) * item.quantity)}
              </p>
            ))}
            {(isNew || isPreparing) && (
              <button
                className="kitchen-text-danger"
                type="button"
                onClick={() => setCancellingOrder(order)}
              >
                Cancel order…
              </button>
            )}
          </div>
        </details>
      </article>
    );
  };

  const queueIsActive = filter === "ACTIVE";
  const showTwoColumns = queueIsActive;
  const newOrders = filteredOrders.filter((o) => o.status === "NEW" || o.status === "PENDING");
  const preparingOrders = filteredOrders.filter((o) => o.status === "PREPARING");
  const loading = queueData === undefined;
  const statusText = queueData !== undefined ? "Live connection" : "Connecting";

  return (
    <div className="kitchen-dashboard">
      <div className="kitchen-dashboard-top">
        <div className="kitchen-dashboard-title">
          <div>
            <h1>Kitchen overview</h1>
            <p>Current work stays in view as each list grows.</p>
          </div>
          <span className="kitchen-updated">
            Updated {lastRefreshed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
        <div className="kitchen-summary" aria-label="Current workload">
          <button
            type="button"
            className={queueIsActive ? "is-selected" : ""}
            onClick={() => setFilter("ACTIVE")}
          >
            Active <strong>{activeCount}</strong>
          </button>
          <button
            type="button"
            className={filter === "NEW" ? "is-selected" : ""}
            onClick={() => setFilter("NEW")}
          >
            New <strong>{newCount}</strong>
          </button>
          <button
            type="button"
            className={filter === "PREPARING" ? "is-selected" : ""}
            onClick={() => setFilter("PREPARING")}
          >
            Preparing <strong>{preparingCount}</strong>
          </button>
          <span className="kitchen-help-count">
            Assistance <strong>{activeServiceRequests.length}</strong>
          </span>
          <div className="kitchen-tools">
            <span className={queueData !== undefined ? "kitchen-connected" : "kitchen-disconnected"}>
              {statusText}
            </span>
            <button
              type="button"
              onClick={toggleSound}
              aria-label={soundEnabled ? "Mute voice alerts" : "Enable voice alerts"}
              title={soundEnabled ? "Mute voice alerts" : "Enable voice alerts"}
            >
              {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
              <span>{soundEnabled ? "Voice on" : "Muted"}</span>
            </button>
            <button
              type="button"
              onClick={() => setLastRefreshed(new Date())}
              disabled={loading}
              aria-label="Refresh kitchen queue"
              title="Refresh kitchen queue"
            >
              <RefreshCw size={17} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {newOrderAlert && (
          <div className="kitchen-alert" role="status">
            <Bell size={17} />
            <span>
              New order {newOrderAlert.orderNumber} · Table {newOrderAlert.tableNumber}
            </span>
            <button
              type="button"
              onClick={() => setNewOrderAlert(null)}
              aria-label="Dismiss alert"
            >
              <X size={18} />
            </button>
          </div>
        )}
      </div>

      <div className="kitchen-grid">
        <section
          className={`kitchen-board ${showTwoColumns ? "has-two-queues" : ""}`}
          aria-label="Kitchen orders"
        >
          {showTwoColumns ? (
            <>
              <div className="kitchen-panel">
                <div className="kitchen-panel-heading">
                  <h2>
                    New <span>{newCount}</span>
                  </h2>
                  <small>Oldest first</small>
                </div>
                <div className="kitchen-panel-scroll" role="region" aria-label="New orders" tabIndex={0}>
                  {newOrders.length ? (
                    newOrders.map(renderOrder)
                  ) : (
                    <p className="kitchen-empty">
                      {loading
                        ? "Loading new orders…"
                        : "No new orders. Incoming orders will appear here automatically."}
                    </p>
                  )}
                </div>
              </div>
              <div className="kitchen-panel">
                <div className="kitchen-panel-heading">
                  <h2>
                    Preparing <span>{preparingCount}</span>
                  </h2>
                  <small>Oldest first</small>
                </div>
                <div
                  className="kitchen-panel-scroll"
                  role="region"
                  aria-label="Preparing orders"
                  tabIndex={0}
                >
                  {preparingOrders.length ? (
                    preparingOrders.map(renderOrder)
                  ) : (
                    <p className="kitchen-empty">
                      {loading ? "Loading preparing orders…" : "Nothing is preparing right now."}
                    </p>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="kitchen-panel">
              <div className="kitchen-panel-heading">
                <h2>
                  {filter === "ALL"
                    ? "All orders"
                    : filter === "NEW"
                    ? "New orders"
                    : filter === "PREPARING"
                    ? "Preparing orders"
                    : filter === "DELIVERED"
                    ? "Delivered orders"
                    : "Cancelled orders"}{" "}
                  <span>{filteredOrders.length}</span>
                </h2>
                <small>
                  {filter === "NEW" || filter === "PREPARING" ? "Oldest first" : "Newest first"}
                </small>
              </div>
              <div
                className="kitchen-panel-scroll"
                role="region"
                aria-label={`${filter.toLowerCase()} orders`}
                tabIndex={0}
              >
                {filteredOrders.length ? (
                  filteredOrders.map(renderOrder)
                ) : (
                  <p className="kitchen-empty">No orders in this view.</p>
                )}
              </div>
            </div>
          )}
        </section>

        <aside className="kitchen-side" aria-label="Assistance and billing">
          <section className="kitchen-panel">
            <div className="kitchen-panel-heading">
              <h2>
                Table assistance <span>{activeServiceRequests.length}</span>
              </h2>
              <small>Oldest first</small>
            </div>
            <div
              className="kitchen-panel-scroll"
              role="region"
              aria-label="Table assistance requests"
              tabIndex={0}
            >
              {activeServiceRequests.length ? (
                activeServiceRequests.map((req) => {
                  const elapsed =
                    now > 0
                      ? Math.max(0, Math.floor((now - new Date(req.created_at).getTime()) / 60000))
                      : 0;
                  const acked = req.status === "ACKNOWLEDGED";

                  return (
                    <article className="kitchen-request" key={req.id}>
                      <div>
                        <strong>Table {req.tables?.table_number ?? req.table_number ?? "—"}</strong>
                        <span className={!acked && elapsed >= 10 ? "kitchen-age is-late" : ""}>
                          {acked ? "Acknowledged" : "Open"} · {elapsed} min
                          {!acked && elapsed >= 10 ? " · overdue" : ""}
                        </span>
                      </div>
                      <p>{SERVICE_REQUEST_TYPE_LABELS[req.request_type] ?? req.request_type}</p>
                      {req.note && <div className="kitchen-note">{req.note}</div>}
                      <div className="kitchen-request-actions">
                        {!acked && (
                          <button
                            type="button"
                            disabled={updatingServiceId === req.id}
                            onClick={() => handleServiceStatusChange(req.id, "ACKNOWLEDGE")}
                          >
                            Acknowledge
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={updatingServiceId === req.id}
                          onClick={() => handleServiceStatusChange(req.id, "RESOLVE")}
                        >
                          Resolve
                        </button>
                      </div>
                    </article>
                  );
                })
              ) : (
                <p className="kitchen-empty">No tables need assistance.</p>
              )}
            </div>
          </section>
          <TableSessionsPanel onSessionClosed={() => {}} />
        </aside>
      </div>

      <div className="kitchen-history" aria-label="Order history filters">
        <span>Other views</span>
        <button
          type="button"
          className={filter === "DELIVERED" ? "is-selected" : ""}
          onClick={() => setFilter("DELIVERED")}
        >
          Delivered ({deliveredCount})
        </button>
        <button
          type="button"
          className={filter === "CANCELLED" ? "is-selected" : ""}
          onClick={() => setFilter("CANCELLED")}
        >
          Cancelled ({cancelledCount})
        </button>
        <button
          type="button"
          className={filter === "ALL" ? "is-selected" : ""}
          onClick={() => setFilter("ALL")}
        >
          All ({orders.length})
        </button>
      </div>

      {cancellingOrder && (
        <div className="kitchen-modal-overlay" role="presentation">
          <div
            className="kitchen-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="kitchen-cancel-heading"
          >
            <h2 id="kitchen-cancel-heading">
              Cancel order {cancellingOrder.order_number || `#${cancellingOrder.id.slice(0, 4)}`}?
            </h2>
            <p>Table {cancellingOrder.tables?.table_number ?? "—"}. This action cannot be reversed.</p>
            <label htmlFor="kitchen-cancellation-reason">Cancellation reason (optional)</label>
            <input
              id="kitchen-cancellation-reason"
              type="text"
              value={cancellationReason}
              onChange={(e) => setCancellationReason(e.target.value)}
              placeholder="Customer requested, out of ingredients…"
            />
            <div className="kitchen-modal-actions">
              <button
                type="button"
                disabled={updatingId === cancellingOrder.id}
                onClick={() => {
                  setCancellingOrder(null);
                  setCancellationReason("");
                }}
              >
                Back
              </button>
              <button
                type="button"
                className="is-danger"
                disabled={updatingId === cancellingOrder.id}
                onClick={() =>
                  handleStatusChange(cancellingOrder.id, "CANCELLED", cancellationReason)
                }
              >
                Confirm cancellation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
