"use client";

import * as React from "react";
import { Plus, X, CircleCheck, CircleX } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { Tables } from "@/types/database";
import { addCriterion, deleteCriterion } from "./actions";

type Criterion = Tables<"screening_criteria">;

export function CriteriaList({
  projectId,
  initialCriteria,
}: {
  projectId: string;
  initialCriteria: Criterion[];
}) {
  const [criteria, setCriteria] = React.useState(initialCriteria);
  const [includeDraft, setIncludeDraft] = React.useState("");
  const [excludeDraft, setExcludeDraft] = React.useState("");

  const includes = criteria.filter((c) => c.type === "include");
  const excludes = criteria.filter((c) => c.type === "exclude");

  const handleAdd = async (type: "include" | "exclude", content: string, clear: () => void) => {
    if (!content.trim()) return;
    clear();
    try {
      const created = await addCriterion(projectId, type, content.trim(), criteria.length);
      setCriteria((prev) => [...prev, created]);
    } catch (err) {
      toast.error("Couldn't add criterion", { description: err instanceof Error ? err.message : undefined });
    }
  };

  const handleDelete = async (id: string) => {
    const prev = criteria;
    setCriteria((p) => p.filter((c) => c.id !== id));
    try {
      await deleteCriterion(id, projectId);
    } catch (err) {
      setCriteria(prev);
      toast.error("Couldn't remove criterion", { description: err instanceof Error ? err.message : undefined });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Inclusion & exclusion criteria</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <h4 className="flex items-center gap-1.5 text-sm font-medium text-success">
            <CircleCheck className="h-4 w-4" /> Include
          </h4>
          {includes.map((c) => (
            <CriterionRow key={c.id} content={c.content} onDelete={() => handleDelete(c.id)} />
          ))}
          <div className="flex gap-2">
            <Input
              value={includeDraft}
              onChange={(e) => setIncludeDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAdd("include", includeDraft, () => setIncludeDraft(""));
                }
              }}
              placeholder="Add inclusion criterion…"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => handleAdd("include", includeDraft, () => setIncludeDraft(""))}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <h4 className="flex items-center gap-1.5 text-sm font-medium text-danger">
            <CircleX className="h-4 w-4" /> Exclude
          </h4>
          {excludes.map((c) => (
            <CriterionRow key={c.id} content={c.content} onDelete={() => handleDelete(c.id)} />
          ))}
          <div className="flex gap-2">
            <Input
              value={excludeDraft}
              onChange={(e) => setExcludeDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAdd("exclude", excludeDraft, () => setExcludeDraft(""));
                }
              }}
              placeholder="Add exclusion criterion…"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => handleAdd("exclude", excludeDraft, () => setExcludeDraft(""))}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CriterionRow({ content, onDelete }: { content: string; onDelete: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md bg-surface-alt px-3 py-2 text-sm">
      <span>{content}</span>
      <button
        type="button"
        aria-label="Remove"
        className="touch-target -mr-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full hover:bg-border"
        onClick={onDelete}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
