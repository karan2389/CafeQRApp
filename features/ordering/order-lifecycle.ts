import type { OrderStatus } from "@/types";

/**
 * Valid order status transitions based on demo and architecture rules.
 */
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  NEW: ["PREPARING"],
  PREPARING: ["DELIVERED"],
  DELIVERED: [],
};

export function canTransitionOrderStatus(current: OrderStatus, next: OrderStatus): boolean {
  return ALLOWED_TRANSITIONS[current]?.includes(next) ?? false;
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  NEW: "Sent to kitchen",
  PREPARING: "Preparing",
  DELIVERED: "Delivered",
};

export const ORDER_STATUS_STYLES: Record<OrderStatus, string> = {
  NEW: "bg-[#fff0dc] text-[#a84d18]",
  PREPARING: "bg-[#e8eef8] text-[#34598a]",
  DELIVERED: "bg-[#e5f2e8] text-[#346548]",
};
