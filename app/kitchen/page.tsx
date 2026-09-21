"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { formatINR, readDemoState, resetDemoState } from "@/app/lib/demo-store";
import { useDemoState } from "@/app/lib/use-demo-state";
import { SOUND_ENABLED_STORAGE_KEY } from "@/lib/constants";
import { playKitchenAlert } from "@/features/kitchen/kitchen-sound";
import { kitchenOrderStatusMeta } from "@/features/kitchen/kitchen-status";
import { KitchenHeader } from "@/components/kitchen/kitchen-header";
import { KitchenTableCard } from "@/components/kitchen/kitchen-table-card";
import { KitchenTableDetail } from "@/components/kitchen/kitchen-table-detail";
import type { DemoEvent, DemoOrder, OrderStatus } from "@/types";

export default function KitchenPage() {
  const [selectedTableId, setSelectedTableId] = useState("table-2");
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [now, setNow] = useState(0);
  const soundEnabledRef = useRef(false);

  const handleRemoteEvent = useCallback((event: DemoEvent) => {
    const latest = readDemoState();
    const table = "tableId" in event ? latest.tables.find((entry) => entry.id === event.tableId) : undefined;
    if (event.type === "ORDER_CREATED") {
      const order = latest.orders.find((entry) => entry.id === event.orderId);
      if (!order || !table) return;
      const puffsOnly = order.items.every((item) => item.section === "PUFFS");
      const mixed =
        order.items.some((item) => item.section === "MAIN") &&
        order.items.some((item) => item.section === "PUFFS");
      toast.success(
        puffsOnly
          ? `New Puffs order from ${table.label}`
          : mixed
            ? `New mixed order from ${table.label}`
            : `New order from ${table.label}`,
        {
          description: `${order.customerName} · ${order.items.reduce(
            (sum, item) => sum + item.quantity,
            0
          )} items · ${formatINR(order.totalPaise)}`,
        }
      );
      if (soundEnabledRef.current) playKitchenAlert(puffsOnly ? "PUFFS" : "STANDARD");
      setSelectedTableId(table.id);
    }
    if (event.type === "STAFF_CALLED" && table) {
      toast.warning(`${table.label} is calling staff`, {
        description: "Service request needs acknowledgement.",
      });
      if (soundEnabledRef.current) playKitchenAlert("BELL");
      setSelectedTableId(table.id);
    }
    if (event.type === "DEMO_RESET") toast.success("Demo data has been reset.");
  }, []);

  const { state, setState, commit } = useDemoState(handleRemoteEvent);

  useEffect(() => {
    const restore = window.setTimeout(() => {
      try {
        const saved = window.sessionStorage.getItem(SOUND_ENABLED_STORAGE_KEY) === "yes";
        setSoundEnabled(saved);
        soundEnabledRef.current = saved;
      } catch {
        // Ignore sessionStorage errors
      }
      setNow(new Date().getTime());
    }, 0);
    const timer = window.setInterval(() => setNow(new Date().getTime()), 30_000);
    return () => {
      window.clearTimeout(restore);
      window.clearInterval(timer);
    };
  }, []);

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    soundEnabledRef.current = next;
    try {
      window.sessionStorage.setItem(SOUND_ENABLED_STORAGE_KEY, next ? "yes" : "no");
    } catch {
      // Ignore sessionStorage errors
    }
    if (next) {
      playKitchenAlert("STANDARD");
      toast.success("Sound alerts enabled.");
    }
  };

  const selectedTable = state?.tables.find((table) => table.id === selectedTableId);
  const selectedOrders = useMemo(
    () =>
      state?.orders
        .filter((order) => order.tableId === selectedTableId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)) ?? [],
    [state, selectedTableId]
  );
  const selectedCall = state?.staffCalls.find(
    (call) => call.tableId === selectedTableId && call.status === "PENDING"
  );
  const tableTotal = selectedOrders.reduce((sum, order) => sum + order.totalPaise, 0);
  const tableQuantity = selectedOrders.reduce(
    (sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
    0
  );

  const setOrderStatus = (order: DemoOrder, status: OrderStatus) => {
    commit(
      (current) => ({
        ...current,
        orders: current.orders.map((entry) =>
          entry.id === order.id ? { ...entry, status, updatedAt: new Date().toISOString() } : entry
        ),
      }),
      { type: "ORDER_STATUS_CHANGED", tableId: order.tableId, orderId: order.id }
    );
    toast.success(`${order.orderNumber} marked ${kitchenOrderStatusMeta[status].label.toLowerCase()}.`);
  };

  const acknowledgeCall = () => {
    if (!selectedCall || !selectedTable) return;
    commit(
      (current) => ({
        ...current,
        staffCalls: current.staffCalls.map((call) =>
          call.id === selectedCall.id
            ? { ...call, status: "ACKNOWLEDGED", acknowledgedAt: new Date().toISOString() }
            : call
        ),
      }),
      { type: "STAFF_CALL_ACKNOWLEDGED", tableId: selectedTable.id }
    );
    toast.success(`${selectedTable.label} call acknowledged.`);
  };

  const closeTable = () => {
    if (!selectedTable) return;
    commit(
      (current) => ({
        ...current,
        tables: current.tables.map((table) =>
          table.id === selectedTable.id ? { ...table, status: "CLOSED" } : table
        ),
        staffCalls: current.staffCalls.map((call) =>
          call.tableId === selectedTable.id && call.status === "PENDING"
            ? { ...call, status: "ACKNOWLEDGED", acknowledgedAt: new Date().toISOString() }
            : call
        ),
      }),
      { type: "TABLE_CLOSED", tableId: selectedTable.id }
    );
    toast.success(`${selectedTable.label} closed. New orders are blocked.`);
  };

  const reset = () => {
    const initial = resetDemoState();
    setState(initial);
    setSelectedTableId("table-2");
    toast.success("Demo restored to its starting state.");
  };

  if (!state || !selectedTable) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#eceae5]">
        <p className="text-sm font-semibold text-[#766f69]">Loading kitchen dashboard…</p>
      </main>
    );
  }

  const activeTablesCount = state.tables.filter((table) => table.status === "ACTIVE").length;

  return (
    <main className="min-h-screen bg-[#eceae5] text-[#211c18]">
      <KitchenHeader
        soundEnabled={soundEnabled}
        onToggleSound={toggleSound}
        onResetDemo={reset}
      />

      <div className="mx-auto grid max-w-[1500px] gap-5 p-4 sm:p-6 xl:grid-cols-[minmax(0,1fr)_500px]">
        <section>
          <div className="mb-4 flex items-end justify-between">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#81766e]">
                Floor overview
              </p>
              <h2 className="font-display mt-1 text-3xl font-semibold">All tables</h2>
            </div>
            <p className="text-sm font-semibold text-[#6f6761]">{activeTablesCount} active</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-3">
            {state.tables.map((table) => {
              const orders = state.orders.filter((order) => order.tableId === table.id);
              const pendingCall = state.staffCalls.some(
                (call) => call.tableId === table.id && call.status === "PENDING"
              );
              return (
                <KitchenTableCard
                  key={table.id}
                  table={table}
                  orders={orders}
                  pendingCall={pendingCall}
                  isSelected={selectedTableId === table.id}
                  now={now}
                  onSelect={() => setSelectedTableId(table.id)}
                />
              );
            })}
          </div>
        </section>

        <KitchenTableDetail
          selectedTable={selectedTable}
          selectedOrders={selectedOrders}
          selectedCall={selectedCall}
          tableTotal={tableTotal}
          tableQuantity={tableQuantity}
          now={now}
          onAcknowledgeCall={acknowledgeCall}
          onCloseTable={closeTable}
          onSetOrderStatus={setOrderStatus}
        />
      </div>
    </main>
  );
}
