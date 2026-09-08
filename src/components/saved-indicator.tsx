"use client";

import { Check, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SaveStatus } from "@/hooks/use-autosave";

export function SavedIndicator({ status, className }: { status: SaveStatus; className?: string }) {
  if (status === "idle") return null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs transition-opacity duration-150",
        status === "saving" && "text-text-secondary",
        status === "saved" && "text-success",
        status === "error" && "text-danger",
        className
      )}
    >
      {status === "saving" && (
        <>
          <Loader2 className="h-3 w-3 animate-spin" /> Saving…
        </>
      )}
      {status === "saved" && (
        <>
          <Check className="h-3 w-3" /> Saved
        </>
      )}
      {status === "error" && (
        <>
          <AlertCircle className="h-3 w-3" /> Couldn&apos;t save
        </>
      )}
    </span>
  );
}
