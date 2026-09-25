export type ServiceRequestType =
  | "CALL_STAFF"
  | "REQUEST_WATER"
  | "REQUEST_BILL"
  | "REQUEST_ASSISTANCE";

export type ServiceRequestStatus =
  | "OPEN"
  | "ACKNOWLEDGED"
  | "RESOLVED"
  | "CANCELLED";

export interface ServiceRequest {
  id: string;
  table_id: string;
  table_order_session_id: string;
  customer_scan_session_id?: string | null;
  request_type: ServiceRequestType;
  note?: string | null;
  status: ServiceRequestStatus;
  created_at: string;
  acknowledged_at?: string | null;
  resolved_at?: string | null;
  acknowledged_by?: string | null;
  resolved_by?: string | null;
  updated_at: string;
  table_number?: number | string;
  tables?: {
    id: string;
    table_number: number;
    display_name?: string | null;
  };
}

export type StaffServiceRequest = ServiceRequest;
