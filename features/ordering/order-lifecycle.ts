import type { OrderStatus } from "@/types";

/**
 * Valid order status transitions based on demo and architecture rules.
 */
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  NEW: ["PREPARING", "CANCELLED"],
  PREPARING: ["DELIVERED", "CANCELLED"],
  DELIVERED: [],
  CANCELLED: [],
};

export function canTransitionOrderStatus(current: OrderStatus, next: OrderStatus): boolean {
  return ALLOWED_TRANSITIONS[current]?.includes(next) ?? false;
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  NEW: "Order Received",
  PREPARING: "Being Prepared",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

export const ORDER_STATUS_MESSAGES: Record<OrderStatus, string> = {
  NEW: "Your order has been received.",
  PREPARING: "The kitchen is preparing your order.",
  DELIVERED: "Your order has been delivered.",
  CANCELLED: "This order was cancelled.",
};

export const ORDER_STATUS_STYLES: Record<OrderStatus, string> = {
  NEW: "bg-[#fff0dc] text-[#a84d18] border border-[#fbd6af]",
  PREPARING: "bg-[#e8eef8] text-[#34598a] border border-[#c4d6f0]",
  DELIVERED: "bg-[#e5f2e8] text-[#346548] border border-[#bfdfc7]",
  CANCELLED: "bg-[#fdf0ed] text-[#b83826] border border-[#f6c2b9]",
};
