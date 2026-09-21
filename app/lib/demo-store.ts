import { STORAGE_KEY, CHANNEL_NAME, CART_STORAGE_PREFIX } from "@/lib/constants";
import { formatINR } from "@/lib/format";
import { createInitialState } from "./demo-data";
import type { DemoEvent, DemoState } from "./types";

export { STORAGE_KEY, CHANNEL_NAME, formatINR };

export function readDemoState(): DemoState {
  if (typeof window === "undefined") return createInitialState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const initial = createInitialState();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
      return initial;
    }
    const parsed = JSON.parse(raw) as DemoState;
    return parsed?.version === 1 && Array.isArray(parsed.tables) ? parsed : createInitialState();
  } catch {
    return createInitialState();
  }
}

export function writeDemoState(state: DemoState, event: DemoEvent): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent("ember-oak-state-changed"));
  if ("BroadcastChannel" in window) {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage(event);
    channel.close();
  }
}

export function resetDemoState(): DemoState {
  for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith(CART_STORAGE_PREFIX)) window.localStorage.removeItem(key);
  }
  const initial = createInitialState();
  writeDemoState(initial, { type: "DEMO_RESET" });
  return initial;
}
