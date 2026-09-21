import { ReceiptText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { OrderItems } from "./order-items";
import { formatINR } from "@/lib/format";
import { LIMITS } from "@/lib/constants";
import type { OrderLine } from "@/types";

export interface OrderReviewDialogProps {
  open: boolean;
  submitting: boolean;
  tableLabel: string;
  cartLines: OrderLine[];
  cartTotal: number;
  customerName: string;
  kitchenNote: string;
  isClosed: boolean;
  onOpenChange: (open: boolean) => void;
  onCustomerNameChange: (name: string) => void;
  onKitchenNoteChange: (note: string) => void;
  onBack: () => void;
  onConfirmOrder: () => void;
}

export function OrderReviewDialog({
  open,
  submitting,
  tableLabel,
  cartLines,
  cartTotal,
  customerName,
  kitchenNote,
  isClosed,
  onOpenChange,
  onCustomerNameChange,
  onKitchenNoteChange,
  onBack,
  onConfirmOrder,
}: OrderReviewDialogProps) {
  const isNameValid = customerName.trim().length >= LIMITS.MIN_CUSTOMER_NAME_LENGTH;

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent className="max-h-[92vh] w-[calc(100%-1.5rem)] max-w-lg overflow-y-auto rounded-[1.6rem] border-[#d9ccbc] bg-[#fffdf8] p-0">
        <div className="border-b border-[#e2d8ca] px-5 py-5 sm:px-6">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-3 text-3xl">
              <ReceiptText size={25} /> Review order
            </DialogTitle>
            <DialogDescription className="text-sm text-[var(--muted-ink)]">
              {tableLabel} · Check the details before sending.
            </DialogDescription>
          </DialogHeader>
        </div>
        <div className="space-y-5 px-5 pb-6 sm:px-6">
          <OrderItems lines={cartLines} section="MAIN" />
          <OrderItems lines={cartLines} section="PUFFS" />
          <div className="border-y border-[#e4dacd] py-4">
            <div className="flex justify-between text-sm">
              <span className="text-[var(--muted-ink)]">Subtotal</span>
              <strong>{formatINR(cartTotal)}</strong>
            </div>
            <div className="mt-2 flex justify-between text-xl font-extrabold">
              <span>Total</span>
              <span>{formatINR(cartTotal)}</span>
            </div>
          </div>
          <label className="block">
            <span className="mb-2 block text-sm font-bold">
              Your name <span className="text-[#b64f30]">*</span>
            </span>
            <Input
              value={customerName}
              maxLength={LIMITS.MAX_CUSTOMER_NAME_LENGTH}
              onChange={(event) => onCustomerNameChange(event.target.value)}
              placeholder="Enter your name"
              className="h-12 rounded-xl border-[#d8ccbd] bg-white text-base"
            />
          </label>
          <label className="block">
            <span className="mb-2 flex items-center justify-between text-sm font-bold">
              <span>
                Kitchen note <span className="font-normal text-[var(--muted-ink)]">(optional)</span>
              </span>
              <span className="text-xs font-normal text-[var(--muted-ink)]">
                {kitchenNote.length}/{LIMITS.MAX_KITCHEN_NOTE_LENGTH}
              </span>
            </span>
            <Textarea
              value={kitchenNote}
              maxLength={LIMITS.MAX_KITCHEN_NOTE_LENGTH}
              onChange={(event) => onKitchenNoteChange(event.target.value)}
              placeholder="Allergies or preparation note"
              className="min-h-24 resize-none rounded-xl border-[#d8ccbd] bg-white text-base"
            />
          </label>
          <div className="grid grid-cols-[.8fr_1.2fr] gap-3">
            <Button
              variant="outline"
              disabled={submitting}
              onClick={onBack}
              className="h-12 rounded-xl border-[#d8ccbd]"
            >
              Back
            </Button>
            <Button
              disabled={submitting || !isNameValid || isClosed}
              onClick={onConfirmOrder}
              className="h-12 rounded-xl bg-[#4a211a]"
            >
              {submitting ? "Sending…" : "Confirm order"}
            </Button>
          </div>
        </div>
        <button onClick={onBack} aria-label="Close review" className="sr-only">
          <X />
        </button>
      </DialogContent>
    </Dialog>
  );
}
