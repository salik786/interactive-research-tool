"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Two-step "arm then confirm" delete control — first click arms it (shows
 * "Confirm?" for a few seconds), second click within the window fires onConfirm.
 * Never uses window.confirm().
 */
export function ConfirmButton({
  onConfirm,
  children = "Delete",
  armedChildren = "Confirm?",
  className,
  variant = "outline",
  size = "sm",
  armTimeoutMs = 4000,
}: {
  onConfirm: () => void;
  children?: React.ReactNode;
  armedChildren?: React.ReactNode;
  className?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  armTimeoutMs?: number;
}) {
  const [armed, setArmed] = React.useState(false);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <Button
      type="button"
      variant={armed ? "destructive" : variant}
      size={size}
      className={cn(className)}
      onClick={() => {
        if (armed) {
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          setArmed(false);
          onConfirm();
        } else {
          setArmed(true);
          timeoutRef.current = setTimeout(() => setArmed(false), armTimeoutMs);
        }
      }}
    >
      {armed ? armedChildren : children}
    </Button>
  );
}
