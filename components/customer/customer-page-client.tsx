"use client";

import { useParams } from "next/navigation";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Bell, ChevronRight, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { useMenu } from "@/features/menu";
import { formatINR } from "@/lib/format";
import { PUFFS_CONFIRMED_STORAGE_KEY, LIMITS } from "@/lib/constants";
import { useDemoState } from "@/app/lib/use-demo-state";
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
import type { DemoOrder, OrderStatus, ServiceRequest, ServiceRequestStatus } from "@/types";

function getClientCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[2]) : null;
}

export interface CustomerPageClientProps {
  slug?: string;
  customerScanSessionId?: string;
  rawReadCapabilityToken?: string;
}

export function CustomerPageClient({
  slug: propSlug,
  customerScanSessionId: propScanId,
  rawReadCapabilityToken: propReadToken,
}: CustomerPageClientProps = {}) {
  const params = useParams<{ slug?: string }>();
  const slug = propSlug || params?.slug || "table-1";

  // Resolve scan session ID and read capability token from props or cookies
  const [scanSessionId] = useState<string | null>(() => {
    return propScanId ?? getClientCookie("cafe_customer_scan_id");
  });
  const [readCapabilityToken] = useState<string | null>(() => {
    return propReadToken ?? getClientCookie("cafe_customer_read_token");
  });

  // Demo fallback state if Convex is disconnected
  const { state } = useDemoState();
  const { items: menuItems, loading: menuLoading } = useMenu();

  const [selectedCategory, setSelectedCategory] = useState("All");
  const [introDone, setIntroDone] = useState(false);

  useEffect(() => {
    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => setIntroDone(true), reducedMotion ? 0 : 800);
    return () => window.clearTimeout(timer);
  }, []);

  const { cart, cartLines, cartQuantity, cartTotal, setQuantity, clearCart } = useCart(slug, menuItems);

  const [puffsOpen, setPuffsOpen] = useState(() => {
    try {
      if (typeof window !== "undefined") {
        return window.sessionStorage.getItem(PUFFS_CONFIRMED_STORAGE_KEY) === "yes";
      }
    } catch {
      // Ignore sessionStorage access exceptions
    }
    return false;
  });
  const [ageGateOpen, setAgeGateOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [serviceDialogOpen, setServiceDialogOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [kitchenNote, setKitchenNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submissionKey = useRef<string | null>(null);

  // 1. Reactive Table Query from Convex
  const convexTable = useQuery(
    api.tables.getTableBySlug,
    slug ? { slug } : "skip"
  );

  // Authoritative table definition
  const table = useMemo(() => {
    if (convexTable) {
      return {
        id: convexTable._id,
        label: convexTable.displayName,
        number: convexTable.tableNumber,
        slug: convexTable.slug,
        status: convexTable.isActive ? ("ACTIVE" as const) : ("CLOSED" as const),
      };
    }
    return state?.tables.find((entry) => entry.slug === slug);
  }, [convexTable, state?.tables, slug]);

  // 2. Reactive Orders Query from Convex
  const hasReadTokens = Boolean(scanSessionId && readCapabilityToken);
  const ordersResult = useQuery(
    api.orders.getCustomerTableOrders,
    hasReadTokens
      ? {
          customerScanSessionId: scanSessionId as Id<"customerScanSessions">,
          rawReadCapabilityToken: readCapabilityToken!,
        }
      : "skip"
  );

  // 3. Reactive Service Requests Query from Convex
  const serviceRequestsResult = useQuery(
    api.service_requests.getCustomerServiceRequests,
    hasReadTokens
      ? {
          customerScanSessionId: scanSessionId as Id<"customerScanSessions">,
          rawReadCapabilityToken: readCapabilityToken!,
        }
      : "skip"
  );

  // Session status detection: automatically locks UI if table session is settled and closed
  const isSessionClosed =
    ordersResult?.sessionStatus === "CLOSED" ||
    (convexTable !== undefined && !convexTable?.isActive);

  const isClosed = Boolean(table?.status === "CLOSED" || isSessionClosed);

  // Clear cart when session closes
  useEffect(() => {
    if (isClosed) {
      clearCart();
    }
  }, [isClosed, clearCart]);

  // Map Convex orders into UI DemoOrder format
  const fallbackOrders = useMemo(
    () =>
      state?.orders
        .filter((order) => order.tableId === table?.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)) ?? [],
    [state, table?.id]
  );

  const tableOrders: DemoOrder[] = useMemo(() => {
    if (ordersResult?.orders) {
      return ordersResult.orders.map((o) => {
        let mappedStatus: OrderStatus = "NEW";
        if (o.status === "PREPARING") mappedStatus = "PREPARING";
        else if (o.status === "DELIVERED" || o.status === "PAID") mappedStatus = "DELIVERED";
        else if (o.status === "CANCELLED") mappedStatus = "CANCELLED";

        return {
          id: o._id,
          orderNumber: o.orderNumber,
          idempotencyKey: o._id,
          tableId: convexTable?._id ?? table?.id ?? "",
          customerName: o.customerName || "Guest",
          kitchenNote: o.orderNotes || "",
          items: o.items.map((i) => ({
            menuItemId: i._id,
            section: "MAIN" as const,
            name: i.itemName,
            unitPrice: i.unitPricePaise / 100,
            quantity: i.quantity,
            lineTotal: i.itemTotalPaise / 100,
            unitPricePaise: i.unitPricePaise,
            lineTotalPaise: i.itemTotalPaise,
          })),
          subtotal: o.totalAmountPaise / 100,
          total: o.totalAmountPaise / 100,
          subtotalPaise: o.totalAmountPaise,
          totalPaise: o.totalAmountPaise,
          status: mappedStatus,
          cancellationReason: o.cancellationReason || null,
          createdAt: new Date(o.placedAt).toISOString(),
          updatedAt: new Date(o.statusUpdatedAt).toISOString(),
          isCurrentDevice: Boolean(o.isCurrentDevice),
        };
      });
    }
    return fallbackOrders;
  }, [ordersResult, convexTable?._id, table?.id, fallbackOrders]);

  // Map Convex service requests
  const serviceRequests: ServiceRequest[] = useMemo(() => {
    if (serviceRequestsResult) {
      return serviceRequestsResult.map((r) => ({
        id: r._id,
        table_id: convexTable?._id ?? table?.id ?? "",
        table_order_session_id: "",
        request_type: r.requestType,
        note: r.note || null,
        status: r.status as ServiceRequestStatus,
        created_at: new Date(r.createdAt).toISOString(),
        acknowledged_at: null,
        resolved_at: null,
        updated_at: new Date(r.updatedAt).toISOString(),
      }));
    }
    return [];
  }, [serviceRequestsResult, convexTable?._id, table?.id]);

  const activeServiceRequests = useMemo(
    () => serviceRequests.filter((r) => r.status === "OPEN" || r.status === "ACKNOWLEDGED"),
    [serviceRequests]
  );
  const latestActiveServiceRequest = activeServiceRequests[0];

  // Menu categorization
  const mainItems = useMemo(() => menuItems.filter((item) => item.section === "MAIN"), [menuItems]);
  const puffItems = useMemo(() => menuItems.filter((item) => item.section === "PUFFS"), [menuItems]);
  const categories = useMemo(() => Array.from(new Set(mainItems.map((item) => item.category))), [mainItems]);
  const visibleMainItems =
    selectedCategory === "All"
      ? mainItems
      : mainItems.filter((item) => item.category === selectedCategory);

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

  // Order submission
  const confirmOrder = async () => {
    if (!table || isClosed || !cartLines.length || submitting) return;
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
          idempotencyKey: key,
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
          clearCart();
          toast.error("Session closed. Please scan the table QR code again.");
        } else {
          toast.error(result.error || "Failed to submit order. Please try again.");
        }
        setSubmitting(false);
        return;
      }

      const orderNumber = result.order?.orderNumber || `#${String(Date.now()).slice(-4)}`;

      clearCart();
      setKitchenNote("");
      setReviewOpen(false);
      submissionKey.current = null;
      toast.success(`Order ${orderNumber} sent to the kitchen.`);
    } catch (err: unknown) {
      console.error("[CustomerOrder] Submit failed:", err);
      toast.error("Network error while submitting order. Please check your connection.");
    } finally {
      setSubmitting(false);
    }
  };

  if (menuLoading || !introDone) return <CustomerIntro />;

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

      {isClosed && (
        <div className="courista-closed-banner">
          <AlertCircle size={20} />
          Session closed. Please scan the table QR code again.
        </div>
      )}

      <div className="courista-layout">
        <div className="courista-main-column">
          <section className="courista-hero" aria-label="Welcome to Courista">
            <Image
              src="/courista/hero.png"
              alt="Courista cafe wall and iced coffee"
              fill
              priority
              sizes="(min-width: 1024px) 780px, (min-width: 768px) 65vw, 100vw"
              className="courista-hero-image"
            />
            <div className="courista-hero-copy">
              Take a break.
              <br />
              Taste something good.
            </div>
          </section>

          {tableOrders.length > 0 && (
            <a className="courista-orders-shortcut" href="#your-orders">
              <span>
                View your orders <strong>({tableOrders.length})</strong>
              </span>
              <ChevronRight size={19} />
            </a>
          )}

          <nav className="courista-categories" aria-label="Menu categories">
            <button
              type="button"
              className={selectedCategory === "All" ? "is-selected" : ""}
              onClick={() => setSelectedCategory("All")}
            >
              All
            </button>
            {categories.map((category) => (
              <button
                type="button"
                key={category}
                className={selectedCategory === category ? "is-selected" : ""}
                onClick={() => setSelectedCategory(category)}
              >
                {category}
              </button>
            ))}
            {puffItems.length > 0 && (
              <button
                type="button"
                className={selectedCategory === "Puffs" ? "is-selected" : ""}
                onClick={() =>
                  puffsOpen ? setSelectedCategory("Puffs") : setAgeGateOpen(true)
                }
              >
                Puffs · 18+
              </button>
            )}
          </nav>

          <section id="menu" className="courista-menu" aria-label="Menu">
            <h1>
              {selectedCategory === "Puffs"
                ? "Puffs · 18+"
                : selectedCategory === "All"
                ? "Pick your next bite"
                : selectedCategory}
            </h1>
            {selectedCategory === "Puffs" && (
              <p className="courista-menu-note">For adults aged 18 and above.</p>
            )}
            <div className="courista-product-list">
              {(selectedCategory === "Puffs"
                ? puffsOpen
                  ? puffItems
                  : []
                : visibleMainItems
              ).map((item) => (
                <ProductCard
                  key={item.id}
                  item={item}
                  quantity={cart[item.id] ?? 0}
                  disabled={isClosed}
                  onChange={(next) => setQuantity(item.id, next)}
                />
              ))}
              {selectedCategory !== "Puffs" && visibleMainItems.length === 0 && (
                <p className="courista-menu-note">
                  No items are available in this category right now.
                </p>
              )}
            </div>
          </section>

          <button
            type="button"
            className="courista-service-link"
            onClick={() => setServiceDialogOpen(true)}
            disabled={isClosed}
          >
            <Bell size={21} />
            <span>
              {latestActiveServiceRequest
                ? latestActiveServiceRequest.status === "ACKNOWLEDGED"
                  ? "Staff on the way · View request"
                  : "Staff notified · View request"
                : "Need help? Call staff"}
            </span>
            <ChevronRight size={20} />
          </button>

          <div id="your-orders" className="courista-orders-area">
            <CustomerOrderTracker
              orders={tableOrders}
              isLoading={ordersResult === undefined && hasReadTokens}
              isPolling={false}
              error={null}
              lastUpdated={ordersResult ? new Date() : null}
              isSessionClosed={isClosed}
              onRefresh={() => {}}
            />
            <RunningBill orders={tableOrders} isSessionClosed={isClosed} />
          </div>
        </div>

        <aside className="courista-desktop-cart" aria-label="Your cart">
          <div className="courista-desktop-cart-inner">
            <h2>
              <ShoppingBag size={21} /> Your cart <small>{cartQuantity} items</small>
            </h2>
            {cartLines.length ? (
              <>
                <OrderItems lines={cartLines} section="MAIN" />
                <OrderItems lines={cartLines} section="PUFFS" />
                <div className="courista-cart-total">
                  <span>Total</span>
                  <strong>{formatINR(cartTotal)}</strong>
                </div>
                <Button
                  className="courista-cart-submit"
                  onClick={() => setReviewOpen(true)}
                  disabled={isClosed}
                >
                  {isClosed ? "Session closed" : "Review order"}
                </Button>
              </>
            ) : (
              <p>Choose something from the menu to begin.</p>
            )}
          </div>
        </aside>
      </div>

      <CustomerFooter />

      {cartQuantity > 0 && (
        <div className="courista-cart-bar">
          <button
            type="button"
            onClick={() => setReviewOpen(true)}
            disabled={isClosed}
            aria-label={`Review order: ${cartQuantity} items, ${formatINR(cartTotal)}`}
          >
            <ShoppingBag size={22} />
            <span>
              <strong>{isClosed ? "Session closed" : "View cart"}</strong>
              <small>
                {cartQuantity} {cartQuantity === 1 ? "item" : "items"} ·{" "}
                {formatINR(cartTotal)}
              </small>
            </span>
            <ChevronRight size={22} />
          </button>
        </div>
      )}

      <AgeGateDialog
        open={ageGateOpen}
        onOpenChange={setAgeGateOpen}
        onConfirm={confirmAge}
      />

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

      <ServiceRequestDialog
        open={serviceDialogOpen}
        onOpenChange={setServiceDialogOpen}
        tableLabel={table.label}
        isClosed={isClosed}
        serviceRequests={serviceRequests}
        onRefresh={() => {}}
      />
    </main>
  );
}
