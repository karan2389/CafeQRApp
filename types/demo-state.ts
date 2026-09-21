import type { DemoTable } from "./tables";
import type { DemoOrder } from "./orders";
import type { StaffCall } from "./service-calls";

export interface DemoState {
  version: 1;
  tables: DemoTable[];
  orders: DemoOrder[];
  staffCalls: StaffCall[];
}

export type DemoEvent =
  | { type: "ORDER_CREATED"; tableId: string; orderId: string }
  | { type: "ORDER_STATUS_CHANGED"; tableId: string; orderId: string }
  | { type: "STAFF_CALLED"; tableId: string }
  | { type: "STAFF_CALL_ACKNOWLEDGED"; tableId: string }
  | { type: "TABLE_CLOSED"; tableId: string }
  | { type: "DEMO_RESET" };
