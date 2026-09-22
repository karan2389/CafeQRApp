import { BellRing, Clock3 } from "lucide-react";
import { formatINR, elapsed } from "@/lib/format";
import { computeVisualState, visualMeta } from "@/features/kitchen/kitchen-status";
import type { DemoOrder, DemoTable } from "@/types";

export interface KitchenTableCardProps {
  table: DemoTable;
  orders: DemoOrder[];
  pendingCall: boolean;
  isSelected: boolean;
  now: number;
  onSelect: () => void;
}

export function KitchenTableCard({
  table,
  orders,
  pendingCall,
  isSelected,
  now,
  onSelect,
}: KitchenTableCardProps) {
  const newest = [...orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const total = orders.reduce((sum, order) => sum + (order.total ?? ((order.totalPaise ?? 0) / 100)), 0);
  const stateName = computeVisualState(table, orders);
  const meta = visualMeta[stateName];

  return (
    <button
      onClick={onSelect}
      className={`relative min-h-48 rounded-[1.35rem] border-2 p-4 text-left transition-transform hover:-translate-y-0.5 ${
        meta.card
      } ${
        isSelected ? "ring-2 ring-[#2b2420] ring-offset-2 ring-offset-[#eceae5]" : ""
      }`}
    >
      {pendingCall && (
        <span
          className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-[#b42318] text-white shadow-lg"
          title="Staff call"
        >
          <BellRing size={18} />
        </span>
      )}
      <div className="flex items-center gap-2 text-sm font-bold">
        <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />
        {meta.label}
      </div>
      <p className="font-display mt-5 text-3xl font-semibold">{table.label}</p>
      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold opacity-60">
            {orders.length ? `${orders.length} order${orders.length > 1 ? "s" : ""}` : "No orders"}
          </p>
          {newest && (
            <p className="mt-1 flex items-center gap-1.5 text-xs font-bold">
              <Clock3 size={13} />
              {elapsed(newest.createdAt, now)}
            </p>
          )}
        </div>
        <p className="font-display text-xl font-semibold">{formatINR(total)}</p>
      </div>
    </button>
  );
}
