import type { ServiceRequestStatus, ServiceRequestType } from "@/types/service-requests";
export type { ServiceRequestStatus, ServiceRequestType };

export const VALID_REQUEST_TYPES: readonly ServiceRequestType[] = [
  "CALL_STAFF",
  "REQUEST_WATER",
  "REQUEST_BILL",
  "REQUEST_ASSISTANCE",
] as const;

export const VALID_SERVICE_STATUSES: readonly ServiceRequestStatus[] = [
  "OPEN",
  "ACKNOWLEDGED",
  "RESOLVED",
  "CANCELLED",
] as const;

export const SERVICE_REQUEST_TYPE_LABELS: Record<ServiceRequestType, string> = {
  CALL_STAFF: "Call Staff",
  REQUEST_WATER: "Request Water",
  REQUEST_BILL: "Request Bill",
  REQUEST_ASSISTANCE: "Assistance",
};

export const SERVICE_REQUEST_STATUS_LABELS: Record<ServiceRequestStatus, string> = {
  OPEN: "Waiting for staff",
  ACKNOWLEDGED: "Staff is on the way",
  RESOLVED: "Resolved",
  CANCELLED: "Cancelled",
};

export const SERVICE_REQUEST_STATUS_MESSAGES: Record<ServiceRequestStatus, string> = {
  OPEN: "Your request has been sent to the staff.",
  ACKNOWLEDGED: "Staff has acknowledged your request and is attending to it.",
  RESOLVED: "Your request has been resolved.",
  CANCELLED: "This request was cancelled.",
};

export const SERVICE_REQUEST_STATUS_STYLES: Record<ServiceRequestStatus, string> = {
  OPEN: "bg-amber-500/10 text-amber-500 border border-amber-500/20",
  ACKNOWLEDGED: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
  RESOLVED: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  CANCELLED: "bg-stone-500/10 text-stone-400 border border-stone-500/20",
};

export const ALLOWED_STAFF_TRANSITIONS: Record<ServiceRequestStatus, ServiceRequestStatus[]> = {
  OPEN: ["ACKNOWLEDGED", "RESOLVED", "CANCELLED"],
  ACKNOWLEDGED: ["RESOLVED", "CANCELLED"],
  RESOLVED: [],
  CANCELLED: [],
};

export const ALLOWED_CUSTOMER_TRANSITIONS: Record<ServiceRequestStatus, ServiceRequestStatus[]> = {
  OPEN: ["CANCELLED"],
  ACKNOWLEDGED: [],
  RESOLVED: [],
  CANCELLED: [],
};

export function canStaffTransition(current: ServiceRequestStatus, next: ServiceRequestStatus): boolean {
  return ALLOWED_STAFF_TRANSITIONS[current]?.includes(next) ?? false;
}

export function canCustomerTransition(current: ServiceRequestStatus, next: ServiceRequestStatus): boolean {
  return ALLOWED_CUSTOMER_TRANSITIONS[current]?.includes(next) ?? false;
}
