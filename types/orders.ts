import type { MenuSection } from "./menu";

export type OrderStatus = "NEW" | "PREPARING" | "DELIVERED";

export interface OrderLine {
  menuItemId: string;
  section: MenuSection;
  name: string;
  unitPricePaise: number;
  quantity: number;
  lineTotalPaise: number;
}

export interface DemoOrder {
  id: string;
  orderNumber: string;
  idempotencyKey: string;
  tableId: string;
  customerName: string;
  kitchenNote: string;
  items: OrderLine[];
  subtotalPaise: number;
  totalPaise: number;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOrderInput {
  tableId: string;
  customerName: string;
  kitchenNote?: string;
  items: OrderLine[];
  idempotencyKey: string;
}
