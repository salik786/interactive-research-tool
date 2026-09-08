"use client";

import * as React from "react";
import { Sparkles, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import type { SourceStatus } from "@/types/database";
import type { PaperFormInput } from "./actions";

const EMPTY: PaperFormInput = {
  citation: "",
  doi: "",
  method: "",
  dataset: "",
  key_result: "",
  theme: "",
  relevance_note: "",
  status: "pending",
  exclusion_reason: "",
};

export function PaperFormDialog({
  projectId,
  open,
  onOpenChange,
  initial,
  onSubmit,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: (PaperFormInput & { id?: string }) | null;
  onSubmit: (input: PaperFormInput) => Promise<void>;
}) {
  const [form, setForm] = React.useState<PaperFormInput>(EMPTY);
  const [abstractDraft, setAbstractDraft] = React.useState("");
  const [extracting, setExtracting] = React.useState(false);
  const [screening, setScreening] = React.useState(false);
  const [screenResult, setScreenResult] = React.useState<{
    suggestion: string;
    reasoning: string;
    matched_criterion: string;
  } | null>(null);
  const [saving, setSaving] = React.useState(false);

  // Reset the form to the dialog's initial value each time it opens.
  /* eslint-disable react-hooks/set-state-in-effect */
  React.useEffect(() => {
    if (open) {
      setForm(initial ?? EMPTY);
      setAbstractDraft("");
      setScreenResult(null);
    }
  }, [open, initial]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleScreen = async () => {
    if (!abstractDraft.trim()) {
      toast.error("Paste an abstract first.");
      return;
    }
    setScreening(true);
    setScreenResult(null);
    try {
      const res = await fetch("/api/ai/screen-paper", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ project_id: projectId, abstract: abstractDraft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Screening check failed.");
      setScreenResult(data);
    } catch (err) {
      toast.error("Couldn't check against criteria", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setScreening(false);
    }
  };

  const handleExtract = async () => {
    if (!abstractDraft.trim()) {
      toast.error("Paste an abstract first.");
      return;
    }
    setExtracting(true);
    try {
      const res = await fetch("/api/ai/extract-paper", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ abstract: abstractDraft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Extraction failed.");
      setForm((prev) => ({
        ...prev,
        citation: prev.citation || data.citation || prev.citation,
        method: data.method || prev.method,
        dataset: data.dataset || prev.dataset,
        key_result: data.key_result || prev.key_result,
        relevance_note: data.relevance_note || prev.relevance_note,
      }));
      toast.success("Draft filled in — review before saving.");
    } catch (err) {
      toast.error("AI extraction failed", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setExtracting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.citation.trim()) {
      toast.error("Citation is required.");
      return;
    }
    setSaving(true);
    try {
      await onSubmit(form);
      onOpenChange(false);
    } catch (err) {
      toast.error("Couldn't save paper", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initial?.id ? "Edit paper" : "Add paper"}</DialogTitle>
          <DialogDescription>
            Adding a paper links it into your shared library and this project&apos;s matrix.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 rounded-md border border-dashed border-border bg-surface-alt p-3">
          <Label className="flex items-center gap-1.5 text-sm">
            <Sparkles className="h-3.5 w-3.5 text-primary" /> AI extract from abstract
          </Label>
          <Textarea
            value={abstractDraft}
            onChange={(e) => setAbstractDraft(e.target.value)}
            placeholder="Paste an abstract here, then click Extract — you'll still review and edit every field before saving."
            rows={3}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={handleExtract} disabled={extracting} className="self-start">
              {extracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {extracting ? "Extracting…" : "Extract with AI"}
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={handleScreen} disabled={screening} className="self-start">
              {screening ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              {screening ? "Checking…" : "Check against criteria"}
            </Button>
          </div>
          {screenResult && (
            <p className="rounded-md bg-surface px-3 py-2 text-xs text-text-secondary">
              <span className="font-medium capitalize text-text-primary">{screenResult.suggestion}</span>
              {screenResult.matched_criterion && ` — ${screenResult.matched_criterion}`}
              {screenResult.reasoning && `: ${screenResult.reasoning}`}
            </p>
          )}
        </div>

        <Separator />

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Citation" className="sm:col-span-2">
              <Input
                value={form.citation}
                onChange={(e) => setForm({ ...form, citation: e.target.value })}
                placeholder="Author (Year). Title. Venue."
                required
              />
            </Field>
            <Field label="DOI (optional, used to de-duplicate)">
              <Input value={form.doi} onChange={(e) => setForm({ ...form, doi: e.target.value })} />
            </Field>
            <Field label="Theme">
              <Input value={form.theme} onChange={(e) => setForm({ ...form, theme: e.target.value })} />
            </Field>
            <Field label="Method">
              <Input value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} />
            </Field>
            <Field label="Dataset">
              <Input value={form.dataset} onChange={(e) => setForm({ ...form, dataset: e.target.value })} />
            </Field>
          </div>
          <Field label="Key result">
            <Textarea
              value={form.key_result}
              onChange={(e) => setForm({ ...form, key_result: e.target.value })}
              rows={2}
            />
          </Field>
          <Field label="Relevance note">
            <Textarea
              value={form.relevance_note}
              onChange={(e) => setForm({ ...form, relevance_note: e.target.value })}
              rows={2}
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Status">
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as SourceStatus })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="keep">Keep</SelectItem>
                  <SelectItem value="excluded">Excluded</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {form.status === "excluded" && (
              <Field label="Exclusion reason">
                <Input
                  value={form.exclusion_reason}
                  onChange={(e) => setForm({ ...form, exclusion_reason: e.target.value })}
                  required
                />
              </Field>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save paper"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
