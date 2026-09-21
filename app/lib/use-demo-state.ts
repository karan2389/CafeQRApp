"use client";

import { useCallback, useEffect, useState } from "react";
import { CHANNEL_NAME, readDemoState, writeDemoState } from "./demo-store";
import type { DemoEvent, DemoState } from "./types";

export function useDemoState(onEvent?: (event: DemoEvent) => void) {
  const [state, setState] = useState<DemoState | null>(null);

  useEffect(() => {
    const sync = () => setState(readDemoState());
    const initialSync = window.setTimeout(sync, 0);
    const onStorage = (event: StorageEvent) => {
      if (event.key) sync();
    };
    const channel = "BroadcastChannel" in window ? new BroadcastChannel(CHANNEL_NAME) : null;
    if (channel) {
      channel.onmessage = ({ data }: MessageEvent<DemoEvent>) => {
        sync();
        onEvent?.(data);
      };
    }
    window.addEventListener("storage", onStorage);
    window.addEventListener("ember-oak-state-changed", sync);
    return () => {
      window.clearTimeout(initialSync);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("ember-oak-state-changed", sync);
      channel?.close();
    };
  }, [onEvent]);

  const commit = useCallback((updater: (current: DemoState) => DemoState, event: DemoEvent) => {
    const next = updater(readDemoState());
    writeDemoState(next, event);
    setState(next);
    return next;
  }, []);

  return { state, setState, commit };
}
