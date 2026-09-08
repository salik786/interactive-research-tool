"use client";

import * as React from "react";
import { Plus, Download, Pencil, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ConfirmButton } from "@/components/confirm-button";
import { createClient } from "@/lib/supabase/client";
import { useRealtimeTable } from "@/hooks/use-realtime-table";
import { downloadCsv } from "@/lib/export/csv";
import { cn } from "@/lib/utils";
import type { Tables, SourceStatus } from "@/types/database";
import { addPaper, updatePaper, deletePaper, type PaperFormInput } from "./actions";
import { PaperFormDialog } from "./paper-form-dialog";

type ProjectSourceRow = Tables<"project_sources"> & { sources: Tables<"sources"> | null };

const STATUS_STYLES: Record<SourceStatus, { badge: "success" | "warning" | "danger"; border: string; label: string }> = {
  keep: { badge: "success", border: "border-l-success", label: "Keep" },
  pending: { badge: "warning", border: "border-l-warning", label: "Pending" },
  excluded: { badge: "danger", border: "border-l-danger", label: "Excluded" },
};

const FILTERS: { key: SourceStatus | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "keep", label: "Keep" },
  { key: "pending", label: "Pending" },
  { key: "excluded", label: "Excluded" },
];

export function PapersBoard({
  projectId,
  initialPapers,
}: {
  projectId: string;
  initialPapers: ProjectSourceRow[];
}) {
  const [papers, setPapers] = React.useState(initialPapers);
  const [filter, setFilter] = React.useState<SourceStatus | "all">("all");
  const [query, setQuery] = React.useState("");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ProjectSourceRow | null>(null);

  const refresh = React.useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("project_sources")
      .select("*, sources(*)")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    if (data) setPapers(data as ProjectSourceRow[]);
  }, [projectId]);

  useRealtimeTable("project_sources", projectId, refresh);

  const filtered = papers.filter((p) => {
    if (filter !== "all" && p.status !== filter) return false;
    if (query.trim()) {
      const haystack = `${p.sources?.citation ?? ""} ${p.theme ?? ""} ${p.method ?? ""}`.toLowerCase();
      if (!haystack.includes(query.toLowerCase())) return false;
    }
    return true;
  });

  const toInput = (row: ProjectSourceRow): PaperFormInput => ({
    citation: row.sources?.citation ?? "",
    doi: row.sources?.doi ?? "",
    method: row.method ?? "",
    dataset: row.dataset ?? "",
    key_result: row.key_result ?? "",
    theme: row.theme ?? "",
    relevance_note: row.relevance_note ?? "",
    status: row.status,
    exclusion_reason: row.exclusion_reason ?? "",
  });

  const handleSubmit = async (input: PaperFormInput) => {
    if (editing) {
      await updatePaper(editing.id, projectId, input);
    } else {
      await addPaper(projectId, input);
    }
    refresh();
  };

  const handleDelete = async (id: string) => {
    const prev = papers;
    setPapers((p) => p.filter((row) => row.id !== id));
    try {
      await deletePaper(id, projectId);
    } catch (err) {
      setPapers(prev);
      toast.error("Couldn't delete paper", { description: err instanceof Error ? err.message : undefined });
    }
  };

  const handleExport = () => {
    downloadCsv(
      `papers-${projectId}.csv`,
      papers.map((p) => ({
        citation: p.sources?.citation,
        doi: p.sources?.doi,
        method: p.method,
        dataset: p.dataset,
        key_result: p.key_result,
        theme: p.theme,
        status: p.status,
        exclusion_reason: p.exclusion_reason,
        relevance_note: p.relevance_note,
      }))
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "touch-target rounded-full border px-3 text-sm font-medium transition-colors",
                filter === f.key
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-surface text-text-secondary hover:bg-surface-alt"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> Add paper
          </Button>
          <Button variant="outline" onClick={handleExport} disabled={papers.length === 0}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search papers…" className="pl-9" />
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-surface p-8 text-center text-sm text-text-secondary">
          No papers match this view.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {filtered.map((row) => {
            const style = STATUS_STYLES[row.status];
            return (
              <Card key={row.id} className={`border-l-4 ${style.border}`}>
                <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
                  <h3 className="line-clamp-2 font-serif text-base font-semibold">
                    {row.sources?.citation ?? "Untitled"}
                  </h3>
                  <Badge variant={style.badge}>{style.label}</Badge>
                </CardHeader>
                <CardContent className="flex flex-col gap-2 text-sm">
                  {row.theme && <Badge variant="secondary">{row.theme}</Badge>}
                  {row.method && (
                    <p>
                      <span className="font-medium text-text-secondary">Method: </span>
                      {row.method}
                    </p>
                  )}
                  {row.dataset && (
                    <p>
                      <span className="font-medium text-text-secondary">Dataset: </span>
                      {row.dataset}
                    </p>
                  )}
                  {row.key_result && (
                    <p>
                      <span className="font-medium text-text-secondary">Result: </span>
                      {row.key_result}
                    </p>
                  )}
                  {row.status === "excluded" && row.exclusion_reason && (
                    <p className="text-danger">Excluded: {row.exclusion_reason}</p>
                  )}
                  <div className="mt-2 flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditing(row);
                        setDialogOpen(true);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </Button>
                    <ConfirmButton onConfirm={() => handleDelete(row.id)} size="sm" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <PaperFormDialog
        projectId={projectId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={editing ? { ...toInput(editing), id: editing.id } : null}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
