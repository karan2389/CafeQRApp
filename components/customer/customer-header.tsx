import { Bell, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface CustomerHeaderProps {
  tableLabel: string;
  isClosed: boolean;
  activeServiceCount?: number;
  activeServiceStatus?: "OPEN" | "ACKNOWLEDGED" | "RESOLVED" | "CANCELLED";
  onOpenServiceDialog: () => void;
}

export function CustomerHeader({
  tableLabel,
  isClosed,
  activeServiceCount = 0,
  activeServiceStatus,
  onOpenServiceDialog,
}: CustomerHeaderProps) {
  const hasActiveRequest = activeServiceCount > 0;

  return (
    <header className="sticky top-0 z-30 border-b border-[#e1d6c7] bg-[#f8f4ec]/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <div>
          <p className="font-display text-xl font-semibold">Ember &amp; Oak</p>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#9a6a4b]">{tableLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={onOpenServiceDialog}
            disabled={isClosed}
            className={`h-11 rounded-full px-4 border transition-all ${
              hasActiveRequest
                ? activeServiceStatus === "ACKNOWLEDGED"
                  ? "border-blue-400 bg-blue-50 text-blue-800 shadow-sm"
                  : "border-amber-400 bg-amber-50 text-amber-800 shadow-sm"
                : "border-[#d5c8b8] bg-white/70 hover:bg-white text-[#4a211a]"
            }`}
          >
            {hasActiveRequest ? (
              activeServiceStatus === "ACKNOWLEDGED" ? (
                <>
                  <Clock size={16} className="text-blue-600 animate-pulse" />
                  <span className="ml-2 font-bold">Staff on the way</span>
                </>
              ) : (
                <>
                  <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                  <span className="ml-2 font-bold">Staff notified</span>
                </>
              )
            ) : (
              <>
                <Bell size={17} />
                <span className="ml-2 font-medium">Call staff</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </header>
  );
}
