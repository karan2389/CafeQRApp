"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ChevronRight, ShoppingBag, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useMenu } from "@/features/menu";
import { formatINR } from "@/lib/format";
import { PUFFS_CONFIRMED_STORAGE_KEY, LIMITS } from "@/lib/constants";
import { useDemoState } from "@/app/lib/use-demo-state";
import { readDemoState } from "@/app/lib/demo-store";
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
import type { DemoOrder, OrderStatus, ServiceRequest } from "@/types";

export function CustomerPageClient() {
  const { slug } = useParams<{ slug: string }>();
  const { state, commit } = useDemoState();
  const { items: menuItems } = useMenu();
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

  const confirmAge = () => {
    try {
      window.sessionStorage.setItem(PUFFS_CONFIRMED_STORAGE_KEY, "yes");
    } catch {
      // Ignore sessionStorage errors
    }
    setPuffsOpen(true);
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

  if (!state) {
    return (
      <main className="grid min-h-screen place-items-center bg-[var(--paper)]">
        <p className="text-sm font-semibold text-[var(--muted-ink)]">Opening the menu…</p>
      </main>
    );
  }

  if (!table) {
    return (
      <main className="grid min-h-screen place-items-center bg-[var(--paper)] p-6 text-center">
        <div>
          <h1 className="font-display text-4xl font-semibold">Table not found</h1>
          <p className="mt-3 text-[var(--muted-ink)]">Please scan the QR code on your table again.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--paper)] pb-28 text-[var(--ink)] lg:pb-12">
      <CustomerHeader
        tableLabel={table.label}
        isClosed={isClosed}
        activeServiceCount={activeServiceRequests.length}
        activeServiceStatus={latestActiveServiceRequest?.status ?? null}
        onOpenServiceDialog={() => setServiceDialogOpen(true)}
      />

      {isClosed && (
        <div className="border-b border-[#e6be98] bg-[#fbf5ed] px-4 py-4 text-center text-sm font-semibold text-[#663b18] shadow-sm">
          <div className="mx-auto flex max-w-xl items-center justify-center gap-2.5">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#f0dfc8] text-[#8c4613]">
              <AlertCircle size={15} />
            </span>
            <span className="text-base font-bold">
              Session closed. Please scan the table QR code again.
            </span>
          </div>
        </div>
      )}

      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-7 sm:px-6 lg:grid-cols-[minmax(0,1fr)_350px] lg:py-10">
        <div>
          <section className="mb-8 flex items-end justify-between gap-5">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--accent-warm)]">Freshly made</p>
              <h1 className="font-display mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">Main Menu</h1>
              <p className="mt-2 max-w-lg text-base leading-7 text-[var(--muted-ink)]">
                Coffee, breakfast and bakes prepared for your table.
              </p>
            </div>
            <button
              onClick={() =>
                puffsOpen
                  ? document.getElementById("puffs-menu")?.scrollIntoView({ behavior: "smooth" })
                  : setAgeGateOpen(true)
              }
              className="mb-1 hidden items-center gap-2 rounded-full border border-[#d8cdbd] bg-white/55 px-4 py-2 text-sm font-bold text-[#5f5148] sm:flex"
            >
              Puffs <ChevronRight size={15} />
            </button>
          </section>

          <div className="grid gap-5 sm:grid-cols-2">
            {mainItems.map((item) => (
              <ProductCard
                key={item.id}
                item={item}
                quantity={cart[item.id] ?? 0}
                disabled={isClosed}
                onChange={(next) => setQuantity(item.id, next)}
              />
            ))}
          </div>

          <div className="mt-7 sm:hidden">
            <button
              onClick={() =>
                puffsOpen
                  ? document.getElementById("puffs-menu")?.scrollIntoView({ behavior: "smooth" })
                  : setAgeGateOpen(true)
              }
              className="flex w-full items-center justify-between rounded-2xl border border-[#d9cebf] bg-white/55 px-4 py-3 text-sm font-bold text-[#5e5148]"
            >
              <span>Puffs menu · 18+</span>
              <ChevronRight size={17} />
            </button>
          </div>

          {puffsOpen && (
            <section id="puffs-menu" className="mt-14 scroll-mt-24 border-t border-[#ded3c5] pt-10">
              <div className="mb-7 flex items-end justify-between gap-5">
                <div>
                  <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#52705f]">Age confirmed</p>
                  <h2 className="font-display mt-2 text-4xl font-semibold">Puffs</h2>
                  <p className="mt-2 text-sm text-[var(--muted-ink)]">For adults aged 18 and above.</p>
                </div>
                <Sparkles className="text-[#73917d]" />
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                {puffItems.map((item) => (
                  <ProductCard
                    key={item.id}
                    item={item}
                    quantity={cart[item.id] ?? 0}
                    disabled={isClosed}
                    onChange={(next) => setQuantity(item.id, next)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Phase 5: Customer Live Order Tracking Component */}
          <CustomerOrderTracker
            orders={tableOrders}
            isLoading={ordersLoading}
            isPolling={isPolling}
            error={ordersError}
            lastUpdated={lastUpdated}
            isSessionClosed={isClosed}
            onRefresh={handleManualRefresh}
          />

          <RunningBill orders={tableOrders} isSessionClosed={isClosed} />
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-24 rounded-[1.6rem] border border-[#ded3c5] bg-[#fffdf8] p-5 shadow-[0_18px_50px_rgba(65,39,25,.08)]">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#f4e7d7] text-[#a84d18]">
                <ShoppingBag size={21} />
              </span>
              <div>
                <p className="text-lg font-bold">Your cart</p>
                <p className="text-xs text-[var(--muted-ink)]">{cartQuantity} items</p>
              </div>
            </div>
            {cartLines.length ? (
              <div className="mt-5 space-y-5">
                <OrderItems lines={cartLines} section="MAIN" />
                <OrderItems lines={cartLines} section="PUFFS" />
                <div className="border-t border-[#e5dccf] pt-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--muted-ink)]">Subtotal</span>
                    <strong>{formatINR(cartTotal)}</strong>
                  </div>
                  <div className="mt-2 flex justify-between text-lg font-extrabold">
                    <span>Total</span>
                    <span>{formatINR(cartTotal)}</span>
                  </div>
                </div>
                <Button
                  onClick={() => setReviewOpen(true)}
                  disabled={isClosed}
                  className="h-12 w-full rounded-xl bg-[#4a211a] text-white hover:bg-[#351712] disabled:opacity-50"
                >
                  {isClosed ? "Session closed" : "Place order"}
                </Button>
              </div>
            ) : (
              <p className="mt-5 rounded-xl bg-[#f5eee4] px-4 py-6 text-center text-sm text-[var(--muted-ink)]">
                Choose something from the menu to begin.
              </p>
            )}
          </div>
        </aside>
      </div>

      {cartQuantity > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[#dfd3c4] bg-[#fffdf8]/95 p-3 shadow-[0_-14px_35px_rgba(56,35,24,.1)] backdrop-blur-xl lg:hidden">
          <button
            disabled={isClosed}
            onClick={() => setReviewOpen(true)}
            className="mx-auto flex h-14 w-full max-w-xl items-center justify-between rounded-2xl bg-[#4a211a] px-5 text-white disabled:bg-[#978a81]"
          >
            <span className="flex items-center gap-3">
              <span className="grid h-8 min-w-8 place-items-center rounded-full bg-white/15 px-2 text-sm font-bold">
                {cartQuantity}
              </span>
              <span className="font-bold">{isClosed ? "Session closed" : "Review order"}</span>
            </span>
            <span className="font-extrabold">{formatINR(cartTotal)}</span>
          </button>
        </div>
      )}

      <AgeGateDialog
        open={ageGateOpen}
        onOpenChange={setAgeGateOpen}
        onConfirm={confirmAge}
      />

      {table && (
        <OrderReviewDialog
          open={reviewOpen}
          submitting={submitting}
          tableLabel={table.label}
          cartLines={cartLines}
          cartTotal={cartTotal}
          customerName={customerName}
          kitchenNote={kitchenNote}
          isClosed={isClosed}
          onOpenChange={setReviewOpen}
          onCustomerNameChange={setCustomerName}
          onKitchenNoteChange={setKitchenNote}
          onBack={() => setReviewOpen(false)}
          onConfirmOrder={confirmOrder}
        />
      )}

      {table && (
        <ServiceRequestDialog
          open={serviceDialogOpen}
          onOpenChange={setServiceDialogOpen}
          tableLabel={table.label}
          isClosed={isClosed}
          serviceRequests={serviceRequests}
          onRefresh={() => void pollServiceRequestsRef.current?.()}
        />
      )}
    </main>
  );
}
