import { Check, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatINR, formatTime, elapsed } from "@/lib/format";
import { kitchenOrderStatusMeta } from "@/features/kitchen/kitchen-status";
import type { DemoOrder, MenuSection, OrderLine, OrderStatus } from "@/types";

function KitchenItemSection({ lines, section }: { lines: OrderLine[]; section: MenuSection }) {
  const items = lines.filter((line) => line.section === section);
  if (!items.length) return null;

  return (
    <section className="rounded-xl bg-[#f5f0e8] p-3.5">
      <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.13em] text-[#846f62]">
        {section === "MAIN" ? "Main Menu" : "Puffs · 18+"}
      </p>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.menuItemId} className="flex justify-between gap-4 text-sm">
            <p>
              <strong className="mr-2">{item.quantity}×</strong>
              {item.name}
            </p>
            <p className="whitespace-nowrap font-semibold">{formatINR(item.lineTotal ?? ((item.lineTotalPaise ?? 0) / 100))}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export interface KitchenOrderCardProps {
  order: DemoOrder;
  isTableClosed: boolean;
  now: number;
  onSetStatus: (order: DemoOrder, status: OrderStatus) => void;
}

export function KitchenOrderCard({
  order,
  isTableClosed,
  now,
  onSetStatus,
}: KitchenOrderCardProps) {
  const totalItemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <article className="rounded-2xl border border-[#dfd5c8] bg-white p-4 shadow-[0_8px_24px_rgba(48,34,25,.05)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-extrabold">{order.orderNumber}</p>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                kitchenOrderStatusMeta[order.status].style
              }`}
            >
              {kitchenOrderStatusMeta[order.status].label}
            </span>
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold">
            <UserRound size={14} />
            {order.customerName}
          </p>
          <p className="mt-1 text-xs text-[#81766f]">
            {formatTime(order.createdAt)} · {elapsed(order.createdAt, now)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-[#81766f]">{totalItemCount} items</p>
          <p className="mt-1 font-display text-xl font-semibold">{formatINR(order.total ?? ((order.totalPaise ?? 0) / 100))}</p>
        </div>
      </div>

      {order.kitchenNote && (
        <p className="mt-4 rounded-xl border border-[#efd5b8] bg-[#fff7e9] px-3 py-2.5 text-sm leading-5 text-[#7d4f29]">
          <strong>Kitchen note:</strong> {order.kitchenNote}
        </p>
      )}

      <div className="mt-4 space-y-3">
        <KitchenItemSection lines={order.items} section="MAIN" />
        <KitchenItemSection lines={order.items} section="PUFFS" />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 border-t border-[#e9e1d7] pt-4">
        <Button
          variant="outline"
          disabled={order.status !== "NEW" || isTableClosed}
          onClick={() => onSetStatus(order, "PREPARING")}
          className="h-11 rounded-xl border-[#b8c9df] text-[#34598a] hover:bg-[#eef4fb]"
        >
          Preparing
        </Button>
        <Button
          disabled={order.status === "DELIVERED" || isTableClosed}
          onClick={() => onSetStatus(order, "DELIVERED")}
          className="h-11 rounded-xl bg-[#3f6f4c] text-white hover:bg-[#345d40]"
        >
          <Check size={16} />
          <span className="ml-2">Delivered</span>
        </Button>
      </div>
    </article>
  );
}
