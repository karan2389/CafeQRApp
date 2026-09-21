"use client";

import { useMemo } from "react";
import { toast } from "sonner";
import { LIMITS } from "@/lib/constants";
import type { DemoState, DemoTable, DemoEvent } from "@/types";

export interface UseStaffCallProps {
  table: DemoTable | undefined;
  state: DemoState | null;
  now: number;
  commit: (updater: (current: DemoState) => DemoState, event: DemoEvent) => DemoState;
}

export function useStaffCall({ table, state, now, commit }: UseStaffCallProps) {
  const activeCall = useMemo(
    () => state?.staffCalls.find((call) => call.tableId === table?.id && call.status === "PENDING"),
    [state, table]
  );

  const lastCall = useMemo(() => {
    if (!table?.id || !state?.staffCalls) return undefined;
    return state.staffCalls
      .filter((call) => call.tableId === table.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  }, [state, table]);

  const cooldownRemaining = useMemo(() => {
    if (!lastCall) return 0;
    const cooldownEnd = new Date(lastCall.createdAt).getTime() + LIMITS.STAFF_CALL_COOLDOWN_SECONDS * 1000;
    return Math.max(0, Math.ceil((cooldownEnd - now) / 1000));
  }, [lastCall, now]);

  const callStaff = () => {
    if (!table || table.status === "CLOSED" || activeCall || cooldownRemaining > 0) return;
    const callId = `call-${new Date().getTime()}`;
    commit(
      (current) => ({
        ...current,
        staffCalls: [
          ...current.staffCalls,
          { id: callId, tableId: table.id, status: "PENDING", createdAt: new Date().toISOString() },
        ],
      }),
      { type: "STAFF_CALLED", tableId: table.id }
    );
    toast.success("Staff have been notified.");
  };

  return {
    activeCall,
    cooldownRemaining,
    callStaff,
  };
}
