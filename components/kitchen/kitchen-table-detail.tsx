import { BellRing, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatINR, elapsed } from "@/lib/format";
import { KitchenOrderCard } from "./kitchen-order-card";
import type { DemoOrder, DemoTable, OrderStatus, StaffCall } from "@/types";

export interface KitchenTableDetailProps {
  selectedTable: DemoTable;
  selectedOrders: DemoOrder[];
  selectedCall: StaffCall | undefined;
  tableTotal: number;
  tableQuantity: number;
  now: number;
  onAcknowledgeCall: () => void;
  onCloseTable: () => void;
  onSetOrderStatus: (order: DemoOrder, status: OrderStatus) => void;
}

export function KitchenTableDetail({
  selectedTable,
  selectedOrders,
  selectedCall,
  tableTotal,
  tableQuantity,
  now,
  onAcknowledgeCall,
  onCloseTable,
  onSetOrderStatus,
}: KitchenTableDetailProps) {
  const isClosed = selectedTable.status === "CLOSED";

  return (
    <aside className="min-w-0 rounded-[1.6rem] border border-black/10 bg-[#fffdf8] shadow-[0_18px_50px_rgba(47,37,29,.09)] xl:sticky xl:top-5 xl:max-h-[calc(100vh-2.5rem)] xl:overflow-y-auto">
      <div className="sticky top-0 z-10 border-b border-[#e2d8ca] bg-[#fffdf8]/95 p-5 backdrop-blur sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-display text-3xl font-semibold">{selectedTable.label}</h2>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                  isClosed ? "bg-[#e5e2de] text-[#6f6964]" : "bg-[#e2f0e5] text-[#3a6848]"
                }`}
              >
                {isClosed ? "Closed" : "Open"}
              </span>
            </div>
            <p className="mt-1 text-sm text-[#766d66]">
              {selectedOrders.length} submissions · {tableQuantity} items
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#897d74]">Table bill</p>
            <p className="font-display text-2xl font-semibold">{formatINR(tableTotal)}</p>
          </div>
        </div>

        {selectedCall && (
          <div className="mt-5 flex items-center justify-between gap-3 rounded-xl bg-[#fff0ed] p-3 text-[#8d3325]">
            <p className="flex items-center gap-2 text-sm font-bold">
              <BellRing size={18} /> Staff requested · {elapsed(selectedCall.createdAt, now)}
            </p>
            <Button
              onClick={onAcknowledgeCall}
              className="h-9 rounded-lg bg-[#9f3d2e] text-white hover:bg-[#873225]"
            >
              Acknowledge
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        {selectedOrders.length === 0 ? (
          <div className="grid min-h-56 place-items-center rounded-2xl border border-dashed border-[#d8cec1] bg-[#faf6f0] p-8 text-center">
            <div>
              <ShoppingBag className="mx-auto text-[#a39387]" />
              <p className="mt-3 font-bold">No orders for this table</p>
              <p className="mt-1 text-sm text-[#80756d]">
                {isClosed ? "The table is inactive." : "New submissions will appear here."}
              </p>
            </div>
          </div>
        ) : (
          selectedOrders.map((order) => (
            <KitchenOrderCard
              key={order.id}
              order={order}
              isTableClosed={isClosed}
              now={now}
              onSetStatus={onSetOrderStatus}
            />
          ))
        )}
      </div>

      <div className="sticky bottom-0 border-t border-[#e2d8ca] bg-[#fffdf8]/95 p-4 backdrop-blur sm:p-5">
        <Button
          onClick={onCloseTable}
          disabled={isClosed}
          variant="outline"
          className="h-12 w-full rounded-xl border-[#cdbfb0] text-[#5c4336] hover:bg-[#f3eae0]"
        >
          Close table and block new orders
        </Button>
      </div>
    </aside>
  );
}
