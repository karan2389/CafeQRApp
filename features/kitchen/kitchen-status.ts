import type { DemoOrder, DemoTable, OrderStatus } from "@/types";

export type VisualState = "INACTIVE" | "ACTIVE" | "NEW" | "PREPARING" | "DELIVERED";

export const visualMeta: Record<VisualState, { label: string; card: string; dot: string }> = {
  INACTIVE: { label: "Inactive", card: "border-[#d8d5d0] bg-[#eeece8] text-[#837d77]", dot: "bg-[#9f9992]" },
  ACTIVE: { label: "Active", card: "border-[#cadbcf] bg-[#f5faf5]", dot: "bg-[#4c805d]" },
  NEW: { label: "New order", card: "border-[#ef9e62] bg-[#fff5e9] shadow-[0_12px_35px_rgba(207,104,40,.12)]", dot: "bg-[#e66b25] animate-pulse" },
  PREPARING: { label: "Preparing", card: "border-[#8faad0] bg-[#f0f5fb]", dot: "bg-[#4c73aa]" },
  DELIVERED: { label: "Delivered", card: "border-[#b9d2c0] bg-[#f0f7f2]", dot: "bg-[#5f8c6c]" },
};

export const kitchenOrderStatusMeta: Record<OrderStatus, { label: string; style: string }> = {
  NEW: { label: "New", style: "bg-[#fff0dc] text-[#a84d18]" },
  PREPARING: { label: "Preparing", style: "bg-[#e6eef9] text-[#34598a]" },
  DELIVERED: { label: "Delivered", style: "bg-[#e3f0e7] text-[#346548]" },
  CANCELLED: { label: "Cancelled", style: "bg-[#fdeeed] text-[#b83826]" },
};

export function computeVisualState(table: DemoTable, orders: DemoOrder[]): VisualState {
  if (table.status === "CLOSED") return "INACTIVE";
  if (orders.some((order) => order.status === "NEW")) return "NEW";
  if (orders.some((order) => order.status === "PREPARING")) return "PREPARING";
  if (orders.length && orders.every((order) => order.status === "DELIVERED" || order.status === "CANCELLED")) return "DELIVERED";
  return "ACTIVE";
}
