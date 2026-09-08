"use client";

import * as React from "react";
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
  DialogFooter,
} from "@/components/ui/dialog";
import type { Tables, SearchDecision } from "@/types/database";
import type { SearchTestInput } from "./actions";

const EMPTY: SearchTestInput = {
  database: "",
  version_label: "",
  results_count: "",
  relevance_pct: "",
  seed_papers_captured: "Not checked",
  decision: "pending",
  query_string: "",
  notes: "",
};

export function SearchTestFormDialog({
  open,
  onOpenChange,
  initial,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: Tables<"search_tests"> | null;
  onSubmit: (input: SearchTestInput) => Promise<void>;
}) {
  const [form, setForm] = React.useState<SearchTestInput>(EMPTY);
  const [saving, setSaving] = React.useState(false);

  // Reset the form to the dialog's initial value each time it opens.
  /* eslint-disable react-hooks/set-state-in-effect */
  React.useEffect(() => {
    if (open) {
      setForm(
        initial
          ? {
              database: initial.database ?? "",
              version_label: initial.version_label ?? "",
              results_count: initial.results_count ?? "",
              relevance_pct: initial.relevance_pct ?? "",
              seed_papers_captured: initial.seed_papers_captured,
              decision: initial.decision,
              query_string: initial.query_string ?? "",
              notes: initial.notes ?? "",
            }
          : EMPTY
      );
    }
  }, [open, initial]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSubmit(form);
      onOpenChange(false);
    } catch (err) {
      toast.error("Couldn't save this attempt", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit search attempt" : "Log a search attempt"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Database">
              <Input
                value={form.database}
                onChange={(e) => setForm({ ...form, database: e.target.value })}
                placeholder="e.g. Scopus"
              />
            </Field>
            <Field label="Version / attempt label">
              <Input
                value={form.version_label}
                onChange={(e) => setForm({ ...form, version_label: e.target.value })}
                placeholder="e.g. v3"
              />
            </Field>
            <Field label="Results count">
              <Input
                value={form.results_count}
                onChange={(e) => setForm({ ...form, results_count: e.target.value })}
                placeholder="e.g. 214"
              />
            </Field>
            <Field label="Relevance % (first 50 checked)">
              <Input
                value={form.relevance_pct}
                onChange={(e) => setForm({ ...form, relevance_pct: e.target.value })}
                placeholder="e.g. 68%"
              />
            </Field>
            <Field label="Seed papers captured">
              <Select
                value={form.seed_papers_captured}
                onValueChange={(v) => setForm({ ...form, seed_papers_captured: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Not checked">Not checked</SelectItem>
                  <SelectItem value="Yes">Yes</SelectItem>
                  <SelectItem value="No">No</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Decision">
              <Select
                value={form.decision}
                onValueChange={(v) => setForm({ ...form, decision: v as SearchDecision })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Not decided</SelectItem>
                  <SelectItem value="keep">Keep</SelectItem>
                  <SelectItem value="revise">Revise</SelectItem>
                  <SelectItem value="reject">Reject</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Query string">
            <Textarea
              value={form.query_string}
              onChange={(e) => setForm({ ...form, query_string: e.target.value })}
              rows={3}
              className="font-mono text-sm"
            />
          </Field>
          <Field label="Notes">
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save attempt"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
