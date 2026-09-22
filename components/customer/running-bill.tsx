import { OrderItems } from "./order-items";
import { formatINR, formatTime } from "@/lib/format";
import { ORDER_STATUS_LABELS, ORDER_STATUS_STYLES } from "@/features/ordering/order-lifecycle";
import type { DemoOrder } from "@/types";

export interface RunningBillProps {
  orders: DemoOrder[];
}

export function RunningBill({ orders }: RunningBillProps) {
  if (!orders.length) return null;
  const total = orders.reduce((sum, order) => sum + (order.total ?? ((order.totalPaise ?? 0) / 100)), 0);

  return (
    <section className="mt-12 rounded-[1.7rem] bg-[#2b211c] p-5 text-white sm:p-7">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/55">Your table</p>
          <h2 className="font-display mt-1 text-3xl font-semibold">Running bill</h2>
        </div>
        <p className="font-display text-3xl font-semibold">{formatINR(total)}</p>
      </div>
      <div className="mt-6 space-y-3">
        {orders.map((order) => (
          <article key={order.id} className="rounded-2xl border border-white/10 bg-white/[.06] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-bold">{order.orderNumber}</p>
                <p className="mt-1 text-xs text-white/50">
                  {formatTime(order.createdAt)} · {order.items.reduce((sum, item) => sum + item.quantity, 0)} items
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-bold ${
                  ORDER_STATUS_STYLES[order.status]
                }`}
              >
                {ORDER_STATUS_LABELS[order.status]}
              </span>
            </div>
            <div className="mt-3 border-t border-white/10 pt-3">
              <OrderItems lines={order.items} section="MAIN" />
              <div className="mt-3">
                <OrderItems lines={order.items} section="PUFFS" />
              </div>
            </div>
            <p className="mt-3 text-right text-sm font-bold">{formatINR(order.total ?? ((order.totalPaise ?? 0) / 100))}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
