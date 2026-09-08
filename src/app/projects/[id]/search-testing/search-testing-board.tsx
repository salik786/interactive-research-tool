"use client";

import * as React from "react";
import { Plus, Download, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ConfirmButton } from "@/components/confirm-button";
import { createClient } from "@/lib/supabase/client";
import { useRealtimeTable } from "@/hooks/use-realtime-table";
import { downloadCsv } from "@/lib/export/csv";
import type { Tables, SearchDecision } from "@/types/database";
import { createSearchTest, updateSearchTest, deleteSearchTest, type SearchTestInput } from "./actions";
import { SearchTestFormDialog } from "./search-test-form-dialog";

type SearchTest = Tables<"search_tests">;

const DECISION_STYLES: Record<SearchDecision, { badge: "success" | "warning" | "danger" | "secondary"; border: string; label: string }> = {
  keep: { badge: "success", border: "border-l-success", label: "Keep" },
  revise: { badge: "warning", border: "border-l-warning", label: "Revise" },
  reject: { badge: "danger", border: "border-l-danger", label: "Reject" },
  pending: { badge: "secondary", border: "border-l-border", label: "Not decided" },
};

export function SearchTestingBoard({
  projectId,
  initialTests,
}: {
  projectId: string;
  initialTests: SearchTest[];
}) {
  const [tests, setTests] = React.useState(initialTests);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<SearchTest | null>(null);

  const refresh = React.useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("search_tests")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    if (data) setTests(data);
  }, [projectId]);

  useRealtimeTable("search_tests", projectId, refresh);

  const handleSubmit = async (input: SearchTestInput) => {
    if (editing) {
      await updateSearchTest(editing.id, projectId, input);
    } else {
      await createSearchTest(projectId, input);
    }
    refresh();
  };

  const handleDelete = async (id: string) => {
    const prev = tests;
    setTests((p) => p.filter((t) => t.id !== id));
    try {
      await deleteSearchTest(id, projectId);
    } catch (err) {
      setTests(prev);
      toast.error("Couldn't delete", { description: err instanceof Error ? err.message : undefined });
    }
  };

  const handleExport = () => {
    downloadCsv(
      `search-testing-${projectId}.csv`,
      tests.map((t) => ({
        database: t.database,
        version_label: t.version_label,
        results_count: t.results_count,
        relevance_pct: t.relevance_pct,
        seed_papers_captured: t.seed_papers_captured,
        decision: t.decision,
        query_string: t.query_string,
        notes: t.notes,
        created_at: t.created_at,
      }))
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4" /> Log attempt
        </Button>
        <Button variant="outline" onClick={handleExport} disabled={tests.length === 0}>
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>

      {tests.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-surface p-8 text-center text-sm text-text-secondary">
          No search attempts logged yet.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tests.map((test) => {
            const style = DECISION_STYLES[test.decision];
            return (
              <Card key={test.id} className={`border-l-4 ${style.border}`}>
                <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
                  <div>
                    <h3 className="font-serif text-base font-semibold">
                      {test.database || "Untitled database"}
                    </h3>
                    <p className="text-xs text-text-secondary">{test.version_label || "—"}</p>
                  </div>
                  <Badge variant={style.badge}>{style.label}</Badge>
                </CardHeader>
                <CardContent className="flex flex-col gap-2 text-sm">
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-text-secondary">
                    <span>Results: {test.results_count || "—"}</span>
                    <span>Relevance: {test.relevance_pct || "—"}</span>
                    <span>Seed papers: {test.seed_papers_captured}</span>
                  </div>
                  {test.query_string && (
                    <code className="block truncate rounded bg-surface-alt px-2 py-1 font-mono text-xs">
                      {test.query_string}
                    </code>
                  )}
                  {test.notes && <p className="text-text-secondary">{test.notes}</p>}
                  <div className="mt-2 flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditing(test);
                        setDialogOpen(true);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </Button>
                    <ConfirmButton onConfirm={() => handleDelete(test.id)} size="sm" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <SearchTestFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={editing}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
