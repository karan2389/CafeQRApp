import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface CustomerHeaderProps {
  tableLabel: string;
  isClosed: boolean;
  activeCall: boolean;
  cooldownRemaining: number;
  onCallStaff: () => void;
}

export function CustomerHeader({
  tableLabel,
  isClosed,
  activeCall,
  cooldownRemaining,
  onCallStaff,
}: CustomerHeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-[#e1d6c7] bg-[#f8f4ec]/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <div>
          <p className="font-display text-xl font-semibold">Ember &amp; Oak</p>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#9a6a4b]">{tableLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="demo-badge hidden sm:inline-flex">Demo Mode</span>
          <Button
            variant="outline"
            onClick={onCallStaff}
            disabled={isClosed || activeCall || cooldownRemaining > 0}
            className="h-11 rounded-full border-[#d5c8b8] bg-white/70 px-4"
          >
            <Bell size={17} />
            <span className="ml-2">
              {activeCall
                ? "Staff called"
                : cooldownRemaining
                  ? `Wait ${cooldownRemaining}s`
                  : "Call staff"}
            </span>
          </Button>
        </div>
      </div>
    </header>
  );
}
