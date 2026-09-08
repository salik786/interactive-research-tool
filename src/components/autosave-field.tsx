"use client";

import * as React from "react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SavedIndicator } from "@/components/saved-indicator";
import { useAutosave } from "@/hooks/use-autosave";

export function AutosaveTextarea({
  label,
  initialValue,
  onSave,
  placeholder,
  rows = 4,
}: {
  label: string;
  initialValue: string;
  onSave: (value: string) => Promise<void>;
  placeholder?: string;
  rows?: number;
}) {
  const [value, setValue] = React.useState(initialValue);
  const { status } = useAutosave(value, onSave);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <SavedIndicator status={status} />
      </div>
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        rows={rows}
      />
    </div>
  );
}

export function AutosaveInput({
  label,
  initialValue,
  onSave,
  placeholder,
}: {
  label: string;
  initialValue: string;
  onSave: (value: string) => Promise<void>;
  placeholder?: string;
}) {
  const [value, setValue] = React.useState(initialValue);
  const { status } = useAutosave(value, onSave);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <SavedIndicator status={status} />
      </div>
      <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} />
    </div>
  );
}
