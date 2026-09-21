import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface AgeGateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function AgeGateDialog({ open, onOpenChange, onConfirm }: AgeGateDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-md rounded-[1.6rem] border-[#d9ccbc] bg-[#fffdf8] p-6">
        <DialogHeader>
          <DialogTitle className="font-display text-3xl">Before you continue</DialogTitle>
          <DialogDescription className="pt-2 text-base leading-7 text-[var(--muted-ink)]">
            Please confirm that you are 18 years of age or older to view the Puffs menu.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 grid gap-3">
          <Button onClick={onConfirm} className="h-12 rounded-xl bg-[#4a211a]">
            I am 18 or older
          </Button>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="h-12 rounded-xl border-[#d9ccbc]"
          >
            Not now
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
