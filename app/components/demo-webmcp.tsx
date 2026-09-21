"use client";

import { useEffect } from "react";
import { readDemoState, resetDemoState } from "@/app/lib/demo-store";

type BrowserTool = {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
  execute(input: unknown): unknown | Promise<unknown>;
};

type ModelContext = {
  registerTool(tool: BrowserTool, options?: { signal?: AbortSignal }): void | Promise<void>;
};

export function DemoWebMcp() {
  useEffect(() => {
    const context = (document as Document & { modelContext?: ModelContext }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();

    const register = (tool: BrowserTool) => {
      try {
        void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => undefined);
      } catch {
        // Browsers without an active WebMCP implementation can ignore registration.
      }
    };

    register({
      name: "read_cafe_demo_state",
      title: "Read cafe demo state",
      description: "Read the current six-table cafe demo state, including table statuses, order totals and pending staff calls.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: () => {
        const state = readDemoState();
        return {
          tables: state.tables.map((table) => ({
            id: table.id,
            label: table.label,
            status: table.status,
            orderCount: state.orders.filter((order) => order.tableId === table.id).length,
            pendingStaffCall: state.staffCalls.some((call) => call.tableId === table.id && call.status === "PENDING"),
          })),
        };
      },
    });

    register({
      name: "reset_cafe_demo_data",
      title: "Reset cafe demo data",
      description: "Restore the cafe demo to its seeded six-table presentation state.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: () => {
        resetDemoState();
        return { reset: true, tableCount: 6 };
      },
    });

    return () => lifecycle.abort();
  }, []);

  return null;
}
