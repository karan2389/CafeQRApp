"use client";

import { useState } from "react";
import {
  Bell,
  Droplets,
  Receipt,
  HelpCircle,
  Clock,
  CheckCircle2,
  X,
  AlertCircle,
  Loader2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatTime } from "@/lib/format";
import {
  SERVICE_REQUEST_TYPE_LABELS,
  type ServiceRequestType,
  type ServiceRequestStatus,
} from "@/features/service-requests/service-request-lifecycle";
import type { ServiceRequest } from "@/types/service-requests";

export interface ServiceRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tableLabel: string;
  isClosed: boolean;
  serviceRequests: ServiceRequest[];
  onRefresh: () => void;
}

const REQUEST_OPTIONS: {
  type: ServiceRequestType;
  label: string;
  icon: typeof Bell;
  description: string;
}[] = [
  {
    type: "CALL_STAFF",
    label: "Call Staff",
    icon: Bell,
    description: "Request a server to visit your table",
  },
  {
    type: "REQUEST_WATER",
    label: "Request Water",
    icon: Droplets,
    description: "Glasses or a carafe of water",
  },
  {
    type: "REQUEST_BILL",
    label: "Request Bill",
    icon: Receipt,
    description: "Ready to settle your running bill",
  },
  {
    type: "REQUEST_ASSISTANCE",
    label: "Assistance",
    icon: HelpCircle,
    description: "General questions or dietary support",
  },
];

export function ServiceRequestDialog({
  open,
  onOpenChange,
  tableLabel,
  isClosed,
  serviceRequests,
  onRefresh,
}: ServiceRequestDialogProps) {
  const [selectedType, setSelectedType] = useState<ServiceRequestType>("CALL_STAFF");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const activeRequests = serviceRequests.filter(
    (r) => r.status === "OPEN" || r.status === "ACKNOWLEDGED"
  );

  const isTypeActive = activeRequests.some((r) => r.request_type === selectedType);

  const handleSubmit = async () => {
    if (isClosed || submitting || isTypeActive) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/service-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestType: selectedType,
          note: note.trim() || undefined,
        }),
      });

      const data = (await res.json()) as {
        success?: boolean;
        error?: string;
        code?: string;
        serviceRequest?: ServiceRequest;
      };

      if (!res.ok) {
        toast.error(data.error || "Failed to submit request.");
        return;
      }

      toast.success(`${SERVICE_REQUEST_TYPE_LABELS[selectedType]} request sent to staff.`);
      setNote("");
      onRefresh();
    } catch {
      toast.error("Network error submitting request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (id: string) => {
    if (cancellingId) return;
    setCancellingId(id);

    try {
      const res = await fetch(`/api/service-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CANCELLED" }),
      });

      const data = (await res.json()) as { error?: string };

      if (!res.ok) {
        toast.error(data.error || "Unable to cancel request.");
        return;
      }

      toast.success("Request cancelled.");
      onRefresh();
    } catch {
      toast.error("Network error cancelling request.");
    } finally {
      setCancellingId(null);
    }
  };

  const getStatusBadge = (status: ServiceRequestStatus) => {
    switch (status) {
      case "OPEN":
        return (
          <span className="flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-bold text-amber-700 border border-amber-500/20">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
            Waiting for staff
          </span>
        );
      case "ACKNOWLEDGED":
        return (
          <span className="flex items-center gap-1.5 rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-bold text-blue-700 border border-blue-500/20">
            <Clock size={12} className="text-blue-600" />
            Staff on the way
          </span>
        );
      case "RESOLVED":
        return (
          <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-bold text-emerald-700 border border-emerald-500/20">
            <CheckCircle2 size={12} className="text-emerald-600" />
            Resolved
          </span>
        );
      case "CANCELLED":
        return (
          <span className="flex items-center gap-1.5 rounded-full bg-stone-500/10 px-2.5 py-0.5 text-xs font-bold text-stone-600 border border-stone-500/20">
            <XCircle size={12} className="text-stone-500" />
            Cancelled
          </span>
        );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-[1.8rem] bg-[#fffdf9] p-5 sm:p-6 text-[#2d211a]">
        <DialogHeader className="border-b border-[#ece3d6] pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#f4e7d7] text-[#8c3e16]">
                <Bell size={19} />
              </span>
              <div>
                <DialogTitle className="font-display text-2xl font-bold tracking-tight text-[#2d211a]">
                  Service Requests
                </DialogTitle>
                <p className="text-xs text-[#7d6f65]">
                  {tableLabel} · Alert cafe staff directly
                </p>
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Active Requests List */}
        {activeRequests.length > 0 && (
          <div className="mt-4 space-y-2.5">
            <p className="text-xs font-bold uppercase tracking-wider text-[#8a7b70]">
              Active Requests ({activeRequests.length})
            </p>
            {activeRequests.map((req) => (
              <div
                key={req.id}
                className="flex items-center justify-between rounded-xl border border-[#e2d7c8] bg-[#fbf8f3] p-3 shadow-sm"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-[#2a1d17]">
                      {SERVICE_REQUEST_TYPE_LABELS[req.request_type]}
                    </span>
                    {getStatusBadge(req.status)}
                  </div>
                  {req.note && (
                    <p className="mt-1 text-xs text-[#6a5b51]">
                      &quot;{req.note}&quot;
                    </p>
                  )}
                  <p className="mt-0.5 text-[11px] text-[#9b8d81]">
                    Sent at {formatTime(req.created_at)}
                  </p>
                </div>

                {req.status === "OPEN" && (
                  <button
                    onClick={() => handleCancel(req.id)}
                    disabled={cancellingId === req.id}
                    className="flex items-center gap-1 rounded-lg border border-[#e5dcd1] bg-white px-2.5 py-1 text-xs font-semibold text-[#8c3e16] hover:bg-[#faf4ed] disabled:opacity-50"
                  >
                    {cancellingId === req.id ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <X size={12} />
                    )}
                    <span>Cancel</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* New Request Selection */}
        <div className="mt-4">
          <p className="text-xs font-bold uppercase tracking-wider text-[#8a7b70] mb-3">
            Select Request Type
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            {REQUEST_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const isSelected = selectedType === opt.type;
              const isAlreadyOpen = activeRequests.some((r) => r.request_type === opt.type);

              return (
                <button
                  key={opt.type}
                  type="button"
                  onClick={() => setSelectedType(opt.type)}
                  className={`flex flex-col text-left p-3 rounded-2xl border transition-all ${
                    isSelected
                      ? "border-[#8c3e16] bg-[#fbf2e9] ring-2 ring-[#f4e0cf]"
                      : "border-[#e5dcd0] bg-white hover:bg-[#faf6f0]"
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <Icon
                      size={18}
                      className={isSelected ? "text-[#8c3e16]" : "text-[#7a6b61]"}
                    />
                    {isAlreadyOpen && (
                      <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">
                        Pending
                      </span>
                    )}
                  </div>
                  <span className="mt-2 text-sm font-bold text-[#2d211a]">
                    {opt.label}
                  </span>
                  <span className="text-[11px] text-[#7a6b61] mt-0.5 leading-snug">
                    {opt.description}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Optional Note */}
        <div className="mt-4">
          <label
            htmlFor="service-note"
            className="block text-xs font-bold uppercase tracking-wider text-[#8a7b70] mb-1.5"
          >
            Optional Note (max 200 chars)
          </label>
          <input
            id="service-note"
            type="text"
            maxLength={200}
            placeholder="e.g. Extra napkins, warm water, etc."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={submitting || isClosed}
            className="w-full rounded-xl border border-[#dcd1c3] bg-white px-3.5 py-2.5 text-sm text-[#2d211a] placeholder:text-[#a89b90] focus:border-[#8c3e16] focus:outline-none focus:ring-2 focus:ring-[#f4e0cf]"
          />
        </div>

        {/* Warning if already pending */}
        {isTypeActive && (
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-amber-50 p-2.5 text-xs text-amber-800 border border-amber-200">
            <AlertCircle size={15} className="flex-none text-amber-600" />
            <span>
              A {SERVICE_REQUEST_TYPE_LABELS[selectedType]} request is already pending for your table.
            </span>
          </div>
        )}

        {/* Submit Button */}
        <div className="mt-5 flex items-center justify-end gap-3 pt-3 border-t border-[#ece3d6]">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="rounded-xl text-[#7a6b61] hover:bg-[#f5eee4]"
          >
            Close
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isClosed || submitting || isTypeActive}
            className="rounded-xl bg-[#4a211a] text-white hover:bg-[#351712] disabled:opacity-50 px-5"
          >
            {submitting ? (
              <span className="flex items-center gap-2">
                <Loader2 size={15} className="animate-spin" />
                Sending…
              </span>
            ) : isTypeActive ? (
              "Already Active"
            ) : (
              `Send ${SERVICE_REQUEST_TYPE_LABELS[selectedType]}`
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
