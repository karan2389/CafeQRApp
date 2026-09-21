import { ChefHat, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ResetDemoDialog } from "./reset-demo-dialog";

export interface KitchenHeaderProps {
  soundEnabled: boolean;
  onToggleSound: () => void;
  onResetDemo: () => void;
}

export function KitchenHeader({ soundEnabled, onToggleSound, onResetDemo }: KitchenHeaderProps) {
  return (
    <header className="border-b border-black/10 bg-[#24201d] px-4 py-4 text-white sm:px-6">
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#e86f2f] text-white">
            <ChefHat size={23} />
          </span>
          <div>
            <h1 className="font-display text-2xl font-semibold">Kitchen dashboard</h1>
            <p className="text-xs text-white/55">Ember &amp; Oak · live table view</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="demo-badge border-white/15 bg-white/10 text-white/70">Demo Mode</span>
          <Button
            onClick={onToggleSound}
            className={`h-10 rounded-xl border px-3.5 text-sm ${
              soundEnabled
                ? "border-[#538768] bg-[#355e45] text-white hover:bg-[#2d513b]"
                : "border-white/15 bg-white/10 text-white hover:bg-white/15"
            }`}
          >
            {soundEnabled ? <Volume2 size={17} /> : <VolumeX size={17} />}
            <span className="ml-2">{soundEnabled ? "Sound on" : "Enable sound alerts"}</span>
          </Button>
          <ResetDemoDialog onReset={onResetDemo} />
        </div>
      </div>
    </header>
  );
}
