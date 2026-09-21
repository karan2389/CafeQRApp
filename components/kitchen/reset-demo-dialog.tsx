import { RotateCcw } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export interface ResetDemoDialogProps {
  onReset: () => void;
}

export function ResetDemoDialog({ onReset }: ResetDemoDialogProps) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button className="h-10 rounded-xl border border-white/15 bg-white/10 px-3.5 text-white hover:bg-white/15">
          <RotateCcw size={16} />
          <span className="ml-2 hidden sm:inline">Reset demo data</span>
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="rounded-2xl bg-[#fffdf8]">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display text-2xl">Reset all demo activity?</AlertDialogTitle>
          <AlertDialogDescription>
            This restores the six tables, sample orders and staff call to the starting presentation state.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="rounded-xl">Keep current data</AlertDialogCancel>
          <AlertDialogAction onClick={onReset} className="rounded-xl bg-[#4a211a]">
            Reset demo
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
