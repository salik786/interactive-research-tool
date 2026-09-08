"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SavedIndicator } from "@/components/saved-indicator";
import { useAutosave } from "@/hooks/use-autosave";
import { PrismaDiagram } from "@/components/prisma-diagram";
import { updatePrismaCount } from "./actions";
import type { Tables } from "@/types/database";

export function PrismaFlowEditor({
  project,
  projectSources,
}: {
  project: Tables<"projects">;
  projectSources: Pick<Tables<"project_sources">, "status" | "exclusion_reason">[];
}) {
  const identified = project.identified_count ?? 0;
  const duplicatesRemoved = project.duplicates_removed_count ?? 0;
  const screened = Math.max(identified - duplicatesRemoved, 0);
  const fullTextAssessed = projectSources.length;
  const excludedFullText = projectSources.filter((p) => p.status === "excluded").length;
  const included = projectSources.filter((p) => p.status === "keep").length;

  const exclusionReasons = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of projectSources) {
      if (p.status !== "excluded") continue;
      const reason = p.exclusion_reason?.trim() || "No reason given";
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [projectSources]);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Manual counts</CardTitle>
          <CardDescription>
            Deduplication against external databases stays manual for now (Crossref/Semantic
            Scholar integration is out of scope).
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <CountField
            label="Records identified"
            initialValue={project.identified_count}
            onSave={(v) => updatePrismaCount(project.id, "identified_count", v)}
          />
          <CountField
            label="Duplicates removed"
            initialValue={project.duplicates_removed_count}
            onSave={(v) => updatePrismaCount(project.id, "duplicates_removed_count", v)}
          />
          <CountField
            label="Excluded at title/abstract screening"
            initialValue={project.excluded_screening_count}
            onSave={(v) => updatePrismaCount(project.id, "excluded_screening_count", v)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Flow diagram</CardTitle>
        </CardHeader>
        <CardContent>
          <PrismaDiagram
            identified={identified}
            screened={screened}
            duplicatesRemoved={duplicatesRemoved}
            fullTextAssessed={fullTextAssessed}
            excludedFullText={excludedFullText}
            included={included}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Exclusion reasons</CardTitle>
          <CardDescription>Grouped from full-text screening decisions on the Papers page.</CardDescription>
        </CardHeader>
        <CardContent>
          {exclusionReasons.length === 0 ? (
            <p className="text-sm text-text-secondary">No exclusions recorded yet.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {exclusionReasons.map(([reason, count]) => (
                <li key={reason} className="flex items-center justify-between py-2 text-sm">
                  <span>{reason}</span>
                  <span className="font-medium text-text-secondary">{count}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CountField({
  label,
  initialValue,
  onSave,
}: {
  label: string;
  initialValue: number | null;
  onSave: (value: number | null) => Promise<void>;
}) {
  const [value, setValue] = React.useState(initialValue?.toString() ?? "");
  const parsed = value.trim() === "" ? null : Number(value);
  const { status } = useAutosave(parsed, onSave);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <SavedIndicator status={status} />
      </div>
      <Input
        type="number"
        min={0}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="0"
      />
    </div>
  );
}
