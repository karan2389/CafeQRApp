export type StaffCallStatus = "PENDING" | "ACKNOWLEDGED";

export interface StaffCall {
  id: string;
  tableId: string;
  status: StaffCallStatus;
  createdAt: string;
  acknowledgedAt?: string;
}
