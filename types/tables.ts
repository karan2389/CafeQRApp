export type TableStatus = "ACTIVE" | "CLOSED";

export interface DemoTable {
  id: string;
  slug: string;
  label: string;
  status: TableStatus;
}

export interface TableSessionContext {
  table: DemoTable;
  isClosed: boolean;
}
