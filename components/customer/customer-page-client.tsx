"use client";

import { useParams } from "next/navigation";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Bell, ChevronRight, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useMenu } from "@/features/menu";
import { formatINR } from "@/lib/format";
import { PUFFS_CONFIRMED_STORAGE_KEY, LIMITS } from "@/lib/constants";
import { useDemoState } from "@/app/lib/use-demo-state";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useCart } from "@/features/ordering/use-cart";
import { CustomerHeader } from "@/components/customer/customer-header";
import { ProductCard } from "@/components/customer/product-card";
import { OrderItems } from "@/components/customer/order-items";
import { RunningBill } from "@/components/customer/running-bill";
import { AgeGateDialog } from "@/components/customer/age-gate-dialog";
import { OrderReviewDialog } from "@/components/customer/order-review-dialog";
import { CustomerOrderTracker } from "@/components/customer/customer-order-tracker";
import { ServiceRequestDialog } from "@/components/customer/service-request-dialog";
import { CustomerIntro } from "@/components/customer/customer-intro";
import { CustomerFooter } from "@/components/customer/customer-footer";
import type { DemoOrder, OrderStatus, ServiceRequest } from "@/types";

export function CustomerPageClient() {
  const { slug } = useParams<{ slug: string }>();
  const { state, commit } = useDemoState();
  const { items: menuItems, loading: menuLoading } = useMenu();
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [introDone, setIntroDone] = useState(false);
  useEffect(() => {
    const reducedMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => setIntroDone(true), reducedMotion ? 0 : 1100);
    return () => window.clearTimeout(timer);
  }, []);
  const { cart, cartLines, cartQuantity, cartTotal, setQuantity, clearCart } = useCart(slug, menuItems);

  const [puffsOpen, setPuffsOpen] = useState(false);
  const [ageGateOpen, setAgeGateOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [serviceDialogOpen, setServiceDialogOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [kitchenNote, setKitchenNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [serviceRequests, setServiceRequests] = useState<ServiceRequest[]>([]);
  const pollServiceRequestsRef = useRef<() => Promise<void>>(() => Promise.resolve());

  const submissionKey = useRef<string | null>(null);
  const currentSessionIdRef = useRef<string | null>(null);
  const [sessionOrders, setSessionOrders] = useState<DemoOrder[] | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        if (typeof window !== "undefined") {
          setPuffsOpen(window.sessionStorage.getItem(PUFFS_CONFIRMED_STORAGE_KEY) === "yes");
        }
      } catch {
        // Ignore sessionStorage access exceptions
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const table = state?.tables.find((entry) => entry.slug === slug);
  const fallbackOrders = useMemo(
    () =>
      state?.orders
        .filter((order) => order.tableId === table?.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)) ?? [],
    [state, table?.id]
  );
  // Use session-specific orders from API, falling back to local demo state if API is unconfigured
  const tableOrders = sessionOrders !== null ? sessionOrders : fallbackOrders;

  const [isSessionClosed, setIsSessionClosed] = useState(false);
  const isClosed = table?.status === "CLOSED" || isSessionClosed;

  const activeServiceRequests = useMemo(
    () => serviceRequests.filter((r) => r.status === "OPEN" || r.status === "ACKNOWLEDGED"),
    [serviceRequests]
  );
  const latestActiveServiceRequest = activeServiceRequests[0];

  const mainItems = useMemo(() => menuItems.filter((item) => item.section === "MAIN"), [menuItems]);
  const puffItems = useMemo(() => menuItems.filter((item) => item.section === "PUFFS"), [menuItems]);
  const categories = useMemo(() => Array.from(new Set(mainItems.map((item) => item.category))), [mainItems]);
  const visibleMainItems = selectedCategory === "All" ? mainItems : mainItems.filter((item) => item.category === selectedCategory);

  const confirmAge = () => {
    try {
      window.sessionStorage.setItem(PUFFS_CONFIRMED_STORAGE_KEY, "yes");
    } catch {
      // Ignore sessionStorage errors
    }
    setPuffsOpen(true);
    setSelectedCategory("Puffs");
    setAgeGateOpen(false);
  };

  const tableRef = useRef(table);
  useEffect(() => {
    tableRef.current = table;
  }, [table]);

  const commitRef = useRef(commit);
  useEffect(() => {
    commitRef.current = commit;
  }, [commit]);

  // Phase 5: Tracking & polling state
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const hasFetchedOnceRef = useRef(false);
  const pollOrdersRef = useRef<() => Promise<void>>(() => Promise.resolve());

  // Phase 5: Customer order tracking polling loop
  // - Runs once every 12 seconds (10-15s requirement)
  // - Executes immediately on mount
  // - Prevents overlapping requests with isFetchingRef
  // - Pauses when tab is hidden, resumes on visibilitychange
  // - Aborts pending requests on unmount
  // - Strictly only calls commit when new orders arrive or status/cancellation changes
  useEffect(() => {
    let isMounted = true;
    const abortController = new AbortController();
    let timerId: ReturnType<typeof setInterval> | null = null;
    let isFetching = false;

    async function pollOrders() {
      if (!isMounted || isFetching) return;
      if (typeof document !== "undefined" && document.hidden) return;

      isFetching = true;
      setIsPolling(true);
      if (!hasFetchedOnceRef.current) {
        setOrdersLoading(true);
      }

      try {
        const res = await fetch("/api/orders", {
          signal: abortController.signal,
        });

        if (!res.ok) {
          if (res.status === 401 || res.status === 403) {
            setOrdersError("Customer session invalid or expired. Please re-scan table QR.");
          } else {
            setOrdersError("Unable to load latest order updates.");
          }
          return;
        }

        interface ApiOrderItem {
          id?: string;
          menu_item_id?: string;
          item_name: string;
          unit_price_inr: number;
          quantity: number;
          customization_notes?: string | null;
        }
        interface ApiOrder {
          id: string;
          order_number?: string;
          customer_name?: string;
          order_notes?: string;
          total_amount_inr?: number;
          status?: string;
          cancellation_reason?: string | null;
          created_at: string;
          updated_at: string;
          order_items?: ApiOrderItem[];
        }

        const data = (await res.json()) as {
          orders?: ApiOrder[];
          session_id?: string;
          session_status?: string;
          is_session_closed?: boolean;
        };

        const isClosedNow = Boolean(data.is_session_closed || data.session_status === "CLOSED");
        setIsSessionClosed(isClosedNow);

        if (isClosedNow) {
          clearCart();
        }

        // If a new session ID is detected (customer scanned QR for a new session)
        if (data.session_id && currentSessionIdRef.current && currentSessionIdRef.current !== data.session_id) {
          clearCart();
        }
        if (data.session_id) {
          currentSessionIdRef.current = data.session_id;
        }

        if (!isMounted || !data.orders || !Array.isArray(data.orders)) {
          return;
        }

        const currentTable = tableRef.current;
        if (!currentTable) return;

        const incomingDbOrders: DemoOrder[] = data.orders.map((o) => {
          let mappedStatus: OrderStatus = "NEW";
          if (o.status === "PREPARING") mappedStatus = "PREPARING";
          else if (o.status === "DELIVERED") mappedStatus = "DELIVERED";
          else if (o.status === "CANCELLED") mappedStatus = "CANCELLED";
          else mappedStatus = "NEW"; // PENDING or NEW

          return {
            id: o.id,
            orderNumber: o.order_number || `#${o.id.slice(0, 4)}`,
            idempotencyKey: o.id,
            tableId: currentTable.id,
            customerName: o.customer_name || "Guest",
            kitchenNote: o.order_notes || "",
            items: (o.order_items || []).map((i) => ({
              menuItemId: i.menu_item_id || "",
              section: "MAIN" as const,
              name: i.item_name,
              unitPrice: Number(i.unit_price_inr),
              quantity: i.quantity,
              lineTotal: Number(i.unit_price_inr) * i.quantity,
            })),
            subtotal: Number(o.total_amount_inr || 0),
            total: Number(o.total_amount_inr || 0),
            subtotalPaise: Math.round(Number(o.total_amount_inr || 0) * 100),
            totalPaise: Math.round(Number(o.total_amount_inr || 0) * 100),
            status: mappedStatus,
            cancellationReason: o.cancellation_reason || null,
            createdAt: o.created_at,
            updatedAt: o.updated_at,
          };
        });

        // Set session-scoped orders directly for live rendering
        setSessionOrders(incomingDbOrders);

        if (isMounted) {
          setLastUpdated(new Date());
          setOrdersError(null);
        }
      } catch (err: unknown) {
        if ((err as Error)?.name !== "AbortError") {
          // Ignore aborted requests on component unmount
          setOrdersError("Connection issue. Retrying shortly…");
        }
      } finally {
        isFetching = false;
        if (isMounted) {
          setIsPolling(false);
          setOrdersLoading(false);
          hasFetchedOnceRef.current = true;
        }
      }
    }

    async function pollServiceRequests() {
      if (!isMounted) return;
      if (typeof document !== "undefined" && document.hidden) return;

      try {
        const res = await fetch("/api/service-requests", {
          signal: abortController.signal,
        });

        if (res.ok) {
          const data = (await res.json()) as { serviceRequests?: ServiceRequest[]; requests?: ServiceRequest[] };
          const list = data.serviceRequests || data.requests;
          if (isMounted && list && Array.isArray(list)) {
            setServiceRequests(list);
          }
        }
      } catch {
        // Silently ignore abort or network interruptions during polling
      }
    }

    pollOrdersRef.current = pollOrders;
    pollServiceRequestsRef.current = pollServiceRequests;

    // 1. Initial fetch on mount
    pollOrders();
    pollServiceRequests();

    // 2. 12-second polling interval
    timerId = setInterval(() => {
      pollOrders();
      pollServiceRequests();
    }, 12000);

    // 3. Tab visibility listener
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        pollOrders();
        pollServiceRequests();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // 4. Supabase Realtime listener on table_order_sessions and orders for instant updates
    const supabase = getSupabaseClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let channel: any = null;
    if (supabase) {
      channel = supabase
        .channel(`customer-table-session-${slug}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "table_order_sessions",
          },
          () => {
            void pollOrders();
          }
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "orders",
          },
          () => {
            void pollOrders();
          }
        )
        .subscribe();
    }

    return () => {
      isMounted = false;
      abortController.abort();
      if (timerId) clearInterval(timerId);
      if (channel && supabase) {
        supabase.removeChannel(channel);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [slug]);

  const handleManualRefresh = () => {
    pollOrdersRef.current?.();
    pollServiceRequestsRef.current?.();
  };

  const confirmOrder = async () => {
    if (!table || table.status === "CLOSED" || !cartLines.length || submitting) return;
    if (customerName.trim().length < LIMITS.MIN_CUSTOMER_NAME_LENGTH) {
      toast.error("Please enter your name.");
      return;
    }
    setSubmitting(true);
    const key = submissionKey.current ?? crypto.randomUUID();
    submissionKey.current = key;

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cartLines.map((line) => ({
            menuItemId: line.menuItemId,
            quantity: line.quantity,
            customization: kitchenNote.trim() || undefined,
          })),
          customerName: customerName.trim(),
          kitchenNote: kitchenNote.trim() || undefined,
        }),
      });

      const result = (await response.json()) as {
        error?: string;
        order?: {
          id?: string;
          orderNumber?: string;
          totalAmountInr?: number;
          createdAt?: string;
        };
      };

      if (!response.ok) {
        if (result.error === "SESSION_CLOSED") {
          setIsSessionClosed(true);
          clearCart();
          toast.error("Session closed. Please scan the table QR code again.");
        } else {
          toast.error(result.error || "Failed to submit order. Please try again.");
        }
        setSubmitting(false);
        return;
      }

      const orderNumber = result.order?.orderNumber || `#${String(Date.now()).slice(-4)}`;
      const orderId = result.order?.id || `order-${Date.now()}`;
      const createdAt = result.order?.createdAt || new Date().toISOString();
      const confirmedTotal = result.order?.totalAmountInr ?? cartTotal;

      commit(
        (current) => {
          if (current.orders.some((order) => order.idempotencyKey === key)) return current;
          const currentTable = current.tables.find((entry) => entry.id === table.id);
          if (currentTable?.status !== "ACTIVE") return current;
          return {
            ...current,
            orders: [
              ...current.orders,
              {
                id: orderId,
                orderNumber,
                idempotencyKey: key,
                tableId: table.id,
                customerName: customerName.trim(),
                kitchenNote: kitchenNote.trim(),
                items: cartLines,
                subtotal: confirmedTotal,
                total: confirmedTotal,
                subtotalPaise: confirmedTotal * 100,
                totalPaise: confirmedTotal * 100,
                status: "NEW",
                createdAt,
                updatedAt: createdAt,
              },
            ],
          };
        },
        { type: "ORDER_CREATED", tableId: table.id, orderId }
      );

      clearCart();
      setKitchenNote("");
      setReviewOpen(false);
      submissionKey.current = null;
      toast.success(`Order ${orderNumber} sent to the kitchen.`);
      pollOrdersRef.current?.();
    } catch (err: unknown) {
      console.error("[CustomerOrder] Submit failed:", err);
      toast.error("Network error while submitting order. Please check your connection.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!state || menuLoading || !introDone) return <CustomerIntro />;

  if (!table) {
    return (
      <main className="courista-error">
        <h1>Table not found</h1>
        <p>Please scan the QR code on your table again.</p>
      </main>
    );
  }

  return (
    <main className="courista-page" id="top">
      <CustomerHeader
        tableLabel={table.label}
        isClosed={isClosed}
        activeServiceCount={activeServiceRequests.length}
        activeServiceStatus={latestActiveServiceRequest?.status ?? null}
        onOpenServiceDialog={() => setServiceDialogOpen(true)}
      />
      {isClosed && <div className="courista-closed-banner"><AlertCircle size={20} /> Session closed. Please scan the table QR code again.</div>}
      <div className="courista-layout">
        <div className="courista-main-column">
          <section className="courista-hero" aria-label="Welcome to Courista">
            <Image src="/courista/hero.png" alt="Courista cafe wall and iced coffee" fill priority sizes="(min-width: 1024px) 780px, (min-width: 768px) 65vw, 100vw" className="courista-hero-image" />
            <div className="courista-hero-copy">Take a break.<br />Taste something good.</div>
          </section>
          {tableOrders.length > 0 && (
            <a className="courista-orders-shortcut" href="#your-orders">
              <span>View your orders <strong>({tableOrders.length})</strong></span><ChevronRight size={19} />
            </a>
          )}
          <nav className="courista-categories" aria-label="Menu categories">
            <button type="button" className={selectedCategory === "All" ? "is-selected" : ""} onClick={() => setSelectedCategory("All")}>All</button>
            {categories.map((category) => <button type="button" key={category} className={selectedCategory === category ? "is-selected" : ""} onClick={() => setSelectedCategory(category)}>{category}</button>)}
            {puffItems.length > 0 && <button type="button" className={selectedCategory === "Puffs" ? "is-selected" : ""} onClick={() => puffsOpen ? setSelectedCategory("Puffs") : setAgeGateOpen(true)}>Puffs · 18+</button>}
          </nav>
          <section id="menu" className="courista-menu" aria-label="Menu">
            <h1>{selectedCategory === "Puffs" ? "Puffs · 18+" : selectedCategory === "All" ? "Pick your next bite" : selectedCategory}</h1>
            {selectedCategory === "Puffs" && <p className="courista-menu-note">For adults aged 18 and above.</p>}
            <div className="courista-product-list">
              {(selectedCategory === "Puffs" ? puffsOpen ? puffItems : [] : visibleMainItems).map((item) => <ProductCard key={item.id} item={item} quantity={cart[item.id] ?? 0} disabled={isClosed} onChange={(next) => setQuantity(item.id, next)} />)}
              {selectedCategory !== "Puffs" && visibleMainItems.length === 0 && <p className="courista-menu-note">No items are available in this category right now.</p>}
            </div>
          </section>
          <button type="button" className="courista-service-link" onClick={() => setServiceDialogOpen(true)} disabled={isClosed}>
            <Bell size={21} /><span>{latestActiveServiceRequest ? latestActiveServiceRequest.status === "ACKNOWLEDGED" ? "Staff on the way · View request" : "Staff notified · View request" : "Need help? Call staff"}</span><ChevronRight size={20} />
          </button>
          <div id="your-orders" className="courista-orders-area">
            <CustomerOrderTracker orders={tableOrders} isLoading={ordersLoading} isPolling={isPolling} error={ordersError} lastUpdated={lastUpdated} isSessionClosed={isClosed} onRefresh={handleManualRefresh} />
            <RunningBill orders={tableOrders} isSessionClosed={isClosed} />
          </div>
        </div>
        <aside className="courista-desktop-cart" aria-label="Your cart">
          <div className="courista-desktop-cart-inner">
            <h2><ShoppingBag size={21} /> Your cart <small>{cartQuantity} items</small></h2>
            {cartLines.length ? <>
              <OrderItems lines={cartLines} section="MAIN" />
              <OrderItems lines={cartLines} section="PUFFS" />
              <div className="courista-cart-total"><span>Total</span><strong>{formatINR(cartTotal)}</strong></div>
              <Button className="courista-cart-submit" onClick={() => setReviewOpen(true)} disabled={isClosed}>{isClosed ? "Session closed" : "Review order"}</Button>
            </> : <p>Choose something from the menu to begin.</p>}
          </div>
        </aside>
      </div>
      <CustomerFooter />
      {cartQuantity > 0 && <div className="courista-cart-bar">
        <button type="button" onClick={() => setReviewOpen(true)} disabled={isClosed} aria-label={`Review order: ${cartQuantity} items, ${formatINR(cartTotal)}`}>
          <ShoppingBag size={22} /><span><strong>{isClosed ? "Session closed" : "View cart"}</strong><small>{cartQuantity} {cartQuantity === 1 ? "item" : "items"} · {formatINR(cartTotal)}</small></span><ChevronRight size={22} />
        </button>
      </div>}
      <AgeGateDialog open={ageGateOpen} onOpenChange={setAgeGateOpen} onConfirm={confirmAge} />
      <OrderReviewDialog open={reviewOpen} submitting={submitting} tableLabel={table.label} cartLines={cartLines} cartTotal={cartTotal} customerName={customerName} kitchenNote={kitchenNote} isClosed={isClosed} onOpenChange={setReviewOpen} onCustomerNameChange={setCustomerName} onKitchenNoteChange={setKitchenNote} onBack={() => setReviewOpen(false)} onConfirmOrder={confirmOrder} />
      <ServiceRequestDialog open={serviceDialogOpen} onOpenChange={setServiceDialogOpen} tableLabel={table.label} isClosed={isClosed} serviceRequests={serviceRequests} onRefresh={() => void pollServiceRequestsRef.current?.()} />
    </main>
  );
}
