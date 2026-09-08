"use client";

import * as React from "react";
import { Sparkles, Loader2, Download } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SavedIndicator } from "@/components/saved-indicator";
import { useAutosave } from "@/hooks/use-autosave";
import { downloadMarkdown } from "@/lib/export/csv";
import type { Tables } from "@/types/database";
import { saveThemeSynthesis } from "./actions";

type PaperRow = Tables<"project_sources"> & { sources: Tables<"sources"> | null };
interface Theme {
  name: string;
  papers: PaperRow[];
  synthesis: string;
}

export function ThemesBoard({ projectId, themes }: { projectId: string; themes: Theme[] }) {
  const handleExportAll = () => {
    const md = themes
      .map((t) => {
        const list = t.papers.map((p) => `- ${p.sources?.citation ?? "Untitled"}`).join("\n");
        return `## ${t.name}\n\n${t.synthesis || "_No synthesis drafted yet._"}\n\n**Papers (${t.papers.length}):**\n${list}`;
      })
      .join("\n\n---\n\n");
    downloadMarkdown(`themes-${projectId}.md`, `# Themes\n\n${md}`);
  };

  if (themes.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border bg-surface p-8 text-center text-sm text-text-secondary">
        No kept papers yet. Mark papers as &quot;Keep&quot; on the Papers page to see themes here.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Button variant="outline" onClick={handleExportAll} className="self-start">
        <Download className="h-4 w-4" /> Export all themes as Markdown
      </Button>
      {themes.map((theme) => (
        <ThemeCard key={theme.name} projectId={projectId} theme={theme} />
      ))}
    </div>
  );
}

function ThemeCard({ projectId, theme }: { projectId: string; theme: Theme }) {
  const [content, setContent] = React.useState(theme.synthesis);
  const [drafting, setDrafting] = React.useState(false);
  const { status } = useAutosave(content, (v) => saveThemeSynthesis(projectId, theme.name, v));

  const handleDraft = async () => {
    setDrafting(true);
    try {
      const res = await fetch("/api/ai/synthesize-theme", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ project_id: projectId, theme_name: theme.name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Draft failed.");
      setContent(data.draft);
      toast.success("Draft inserted — review before it's finalized.");
    } catch (err) {
      toast.error("Couldn't draft synthesis", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setDrafting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle>
          {theme.name} <span className="ml-1 text-sm font-normal text-text-secondary">({theme.papers.length} papers)</span>
        </CardTitle>
        <Button variant="secondary" size="sm" onClick={handleDraft} disabled={drafting}>
          {drafting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {drafting ? "Drafting…" : "AI draft"}
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-1.5">
          {theme.papers.map((p) => (
            <Badge key={p.id} variant="secondary" className="max-w-full truncate">
              {p.sources?.citation ?? "Untitled"}
            </Badge>
          ))}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-text-secondary">Synthesis</span>
          <SavedIndicator status={status} />
        </div>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={6}
          className="font-serif"
          placeholder="Write or draft a synthesis paragraph for this theme…"
        />
      </CardContent>
    </Card>
  );
}
