"use client";

import { Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AutosaveTextarea } from "@/components/autosave-field";
import { downloadMarkdown } from "@/lib/export/csv";
import { OutlineComposer, type OutlineCounts } from "./outline-composer";
import { saveOutlineSection } from "./actions";
import type { Tables, OutlineSectionKey } from "@/types/database";

export function OutlinePageClient({
  projectId,
  projectName,
  counts,
  sections,
  generations,
  themeSyntheses,
}: {
  projectId: string;
  projectName: string;
  counts: OutlineCounts;
  sections: Record<OutlineSectionKey, string>;
  generations: Tables<"ai_generations">[];
  themeSyntheses: { theme_name: string; content: string }[];
}) {
  const hasOutline = (Object.keys(sections) as OutlineSectionKey[]).filter((k) => sections[k].trim());

  const handleExportFull = () => {
    const md = [
      `# ${projectName} — Outline`,
      `## Introduction\n${sections.intro || "_Not written yet._"}`,
      `## Research gap\n${sections.gap || "_Not written yet._"}`,
      `## Proposed approach\n${sections.approach || "_Not written yet._"}`,
      `## Related work\n${sections.related_work || "_Not written yet._"}`,
      `## Related work by theme\n${
        themeSyntheses.length
          ? themeSyntheses.map((t) => `### ${t.theme_name}\n${t.content || "_No synthesis drafted._"}`).join("\n\n")
          : "_No themes yet._"
      }`,
    ].join("\n\n");
    downloadMarkdown(`outline-${projectId}.md`, md);
  };

  return (
    <div className="flex flex-col gap-8">
      <OutlineComposer
        projectId={projectId}
        counts={counts}
        hasOutline={hasOutline}
        initialGenerations={generations}
      />

      <div className="flex flex-col gap-4">
        <h2 className="font-serif text-lg font-semibold">Hand-written sections</h2>
        <Card>
          <CardHeader>
            <CardTitle>Introduction</CardTitle>
          </CardHeader>
          <CardContent>
            <AutosaveTextarea
              label="Introduction"
              initialValue={sections.intro}
              onSave={(v) => saveOutlineSection(projectId, "intro", v)}
              rows={6}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Research gap</CardTitle>
          </CardHeader>
          <CardContent>
            <AutosaveTextarea
              label="Research gap"
              initialValue={sections.gap}
              onSave={(v) => saveOutlineSection(projectId, "gap", v)}
              rows={6}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Proposed approach</CardTitle>
          </CardHeader>
          <CardContent>
            <AutosaveTextarea
              label="Proposed approach"
              initialValue={sections.approach}
              onSave={(v) => saveOutlineSection(projectId, "approach", v)}
              rows={6}
            />
          </CardContent>
        </Card>
      </div>

      <Button variant="outline" onClick={handleExportFull} className="self-start">
        <Download className="h-4 w-4" /> Export full outline as Markdown
      </Button>
    </div>
  );
}
