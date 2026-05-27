import { useEffect } from "react";
import { listen, type EventCallback } from "@tauri-apps/api/event";

// Subscribe to a Tauri event for the lifetime of the component. Solves
// the race where a component unmounts BEFORE `listen(...)` resolves its
// unlisten function: the previous pattern (`let unlisten = null; listen
// (…).then(fn => unlisten = fn)`) leaked the listener forever in that
// window. Here we track a `cancelled` flag and call the unlisten
// immediately when the listener finally registers, if the effect's
// already cleaned up.
//
// Pass `enabled = false` to skip subscribing (e.g. while `sessionId`
// is still undefined) — keeps call sites free of inner `if` guards.
export function useTauriListen<T>(
  event: string | null | undefined,
  handler: EventCallback<T>,
  deps: React.DependencyList,
  enabled: boolean = true,
) {
  useEffect(() => {
    if (!event || !enabled) return;
    let cancelled = false;
    let unlisten: (() => void) | null = null;
    listen<T>(event, handler).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
