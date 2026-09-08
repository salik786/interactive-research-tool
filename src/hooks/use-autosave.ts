"use client";

import * as React from "react";
import { toast } from "sonner";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * One reusable autosave pattern for every text field in the app: debounce
 * ~500ms after the value stops changing, then persist. On failure, the
 * field keeps the user's unsaved input (never silently discarded) and a
 * toast reports the error.
 */
export function useAutosave<T>(
  value: T,
  save: (value: T) => Promise<void>,
  options?: { debounceMs?: number; enabled?: boolean }
) {
  const debounceMs = options?.debounceMs ?? 500;
  const enabled = options?.enabled ?? true;
  const [status, setStatus] = React.useState<SaveStatus>("idle");
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRender = React.useRef(true);
  const savedValueRef = React.useRef(value);
  const savingRef = React.useRef(false);

  React.useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      savedValueRef.current = value;
      return;
    }
    if (!enabled) return;
    if (JSON.stringify(value) === JSON.stringify(savedValueRef.current)) return;

    setStatus("saving");
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    // `value` is captured fresh on every effect run (deps include it below),
    // and a new run always clears the prior timer, so the closure here is
    // always the latest value — no separate "latest value" ref needed.
    timeoutRef.current = setTimeout(async () => {
      const toSave = value;
      savingRef.current = true;
      try {
        await save(toSave);
        savedValueRef.current = toSave;
        setStatus("saved");
        setTimeout(() => setStatus((s) => (s === "saved" ? "idle" : s)), 2000);
      } catch (err) {
        setStatus("error");
        toast.error("Couldn't save your change", {
          description: err instanceof Error ? err.message : "Please try again.",
        });
      } finally {
        savingRef.current = false;
      }
    }, debounceMs);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(value), enabled]);

  return { status };
}
