import type { MenuSection } from "./menu";

export type OrderStatus = "NEW" | "PREPARING" | "DELIVERED" | "CANCELLED";

export interface OrderLine {
  menuItemId: string;
  section: MenuSection;
  name: string;
  unitPrice: number; // Price in Indian Rupees (₹)
  quantity: number;
  lineTotal: number; // Line total in Indian Rupees (₹)
  /** @deprecated Legacy field preserved for backwards compatibility */
  unitPricePaise?: number;
  /** @deprecated Legacy field preserved for backwards compatibility */
  lineTotalPaise?: number;
}

export interface DemoOrder {
  id: string;
  orderNumber: string;
  idempotencyKey: string;
  tableId: string;
  customerName: string;
  kitchenNote: string;
  items: OrderLine[];
  subtotal: number; // Subtotal in Indian Rupees (₹)
  total: number; // Total in Indian Rupees (₹)
  status: OrderStatus;
  cancellationReason?: string | null;
  createdAt: string;
  updatedAt: string;
  /** @deprecated Legacy field preserved for backwards compatibility */
  subtotalPaise?: number;
  /** @deprecated Legacy field preserved for backwards compatibility */
  totalPaise?: number;
}

export interface CreateOrderInput {
  tableId: string;
  customerName: string;
  kitchenNote?: string;
  items: OrderLine[];
  idempotencyKey: string;
}
