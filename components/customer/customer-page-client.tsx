"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronRight, ShoppingBag, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useMenu } from "@/features/menu";
import { formatINR } from "@/lib/format";
import { PUFFS_CONFIRMED_STORAGE_KEY, LIMITS } from "@/lib/constants";
import { useDemoState } from "@/app/lib/use-demo-state";
import { useCart } from "@/features/ordering/use-cart";
import { useStaffCall } from "@/features/service-calls/use-staff-call";
import { CustomerHeader } from "@/components/customer/customer-header";
import { ProductCard } from "@/components/customer/product-card";
import { OrderItems } from "@/components/customer/order-items";
import { RunningBill } from "@/components/customer/running-bill";
import { AgeGateDialog } from "@/components/customer/age-gate-dialog";
import { OrderReviewDialog } from "@/components/customer/order-review-dialog";

export function CustomerPageClient() {
  const { slug } = useParams<{ slug: string }>();
  const { state, commit } = useDemoState();
  const { items: menuItems } = useMenu();
  const { cart, cartLines, cartQuantity, cartTotal, setQuantity, clearCart } = useCart(slug, menuItems);

  const [puffsOpen, setPuffsOpen] = useState(false);
  const [ageGateOpen, setAgeGateOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [kitchenNote, setKitchenNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [lastOrderId, setLastOrderId] = useState<string | null>(null);
  const [now, setNow] = useState(0);

  const submissionKey = useRef<string | null>(null);

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

  useEffect(() => {
    const update = () => setNow(new Date().getTime());
    const initial = window.setTimeout(update, 0);
    const timer = window.setInterval(update, 1000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, []);

  const table = state?.tables.find((entry) => entry.slug === slug);
  const tableOrders = useMemo(
    () =>
      state?.orders
        .filter((order) => order.tableId === table?.id)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)) ?? [],
    [state, table?.id]
  );

  const isClosed = table?.status === "CLOSED";

  const { activeCall, cooldownRemaining, callStaff } = useStaffCall({
    table,
    state,
    now,
    commit,
  });

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

  const confirmOrder = () => {
    if (!table || table.status === "CLOSED" || !cartLines.length || submitting) return;
    if (customerName.trim().length < LIMITS.MIN_CUSTOMER_NAME_LENGTH) {
      toast.error("Please enter your name.");
      return;
    }
    setSubmitting(true);
    const key = submissionKey.current ?? crypto.randomUUID();
    submissionKey.current = key;
    const timestamp = new Date().getTime();
    const orderId = `order-${timestamp}-${key.slice(0, 5)}`;
    const orderNumber = `#${String(timestamp).slice(-4)}`;
    const createdAt = new Date().toISOString();
    let created = false;

    commit(
      (current) => {
        if (current.orders.some((order) => order.idempotencyKey === key)) return current;
        const currentTable = current.tables.find((entry) => entry.id === table.id);
        if (currentTable?.status !== "ACTIVE") return current;
        created = true;
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
              subtotal: cartTotal,
              total: cartTotal,
              subtotalPaise: cartTotal * 100,
              totalPaise: cartTotal * 100,
              status: "NEW",
              createdAt,
              updatedAt: createdAt,
            },
          ],
        };
      },
      { type: "ORDER_CREATED", tableId: table.id, orderId }
    );

    if (created) {
      setLastOrderId(orderId);
      clearCart();
      setKitchenNote("");
      setReviewOpen(false);
      submissionKey.current = null;
      toast.success(`Order ${orderNumber} sent to the kitchen.`);
    } else {
      toast.error("This table is closed. Please contact staff.");
    }
    setSubmitting(false);
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

  const lastOrder = tableOrders.find((order) => order.id === lastOrderId);

  return (
    <main className="min-h-screen bg-[var(--paper)] pb-28 text-[var(--ink)] lg:pb-12">
      <CustomerHeader
        tableLabel={table.label}
        isClosed={isClosed}
        activeCall={Boolean(activeCall)}
        cooldownRemaining={cooldownRemaining}
        onCallStaff={callStaff}
      />

      {isClosed && (
        <div className="border-b border-[#edc9bc] bg-[#fff1eb] px-4 py-4 text-center text-sm font-semibold text-[#8f3f28]">
          Ordering is closed for {table.label}. Please contact a staff member.
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

          {lastOrder && (
            <section className="mt-10 flex gap-4 rounded-[1.5rem] border border-[#cfe1d2] bg-[#edf7ef] p-5">
              <span className="grid h-11 w-11 flex-none place-items-center rounded-full bg-[#3f6a4a] text-white">
                <Check size={21} />
              </span>
              <div>
                <p className="font-bold">Order {lastOrder.orderNumber} confirmed</p>
                <p className="mt-1 text-sm leading-6 text-[#52705b]">
                  The kitchen has received your order. Its status will update here automatically.
                </p>
              </div>
            </section>
          )}

          <RunningBill orders={tableOrders} />
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
                  className="h-12 w-full rounded-xl bg-[#4a211a] text-white hover:bg-[#351712]"
                >
                  Place order
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
              <span className="font-bold">Review order</span>
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
    </main>
  );
}
