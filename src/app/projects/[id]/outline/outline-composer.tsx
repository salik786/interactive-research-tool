"use client";

import * as React from "react";
import { Sparkles, Loader2, Save, ArrowDownToLine, RefreshCw, Trash2, History, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { OUTLINE_SECTION_META, OUTLINE_TARGETS, type OutlineSectionId } from "@/lib/ai/outline-sections";
import type { AiProviderName } from "@/lib/ai/generate";
import type { Tables, OutlineSectionKey } from "@/types/database";
import { insertGenerationIntoSection } from "./actions";
import { formatDistanceToNow } from "date-fns";

type Generation = Tables<"ai_generations">;

export interface OutlineCounts {
  objectives: number;
  subQuestions: number;
  kept: number;
  pending: number;
  criteria: number;
  themes: number;
}

function previewFor(id: OutlineSectionId, counts: OutlineCounts, hasOutline: OutlineSectionKey[]): string {
  switch (id) {
    case "research_question":
      return "Your research question";
    case "aim_objectives":
      return `Aim + ${counts.objectives} objective${counts.objectives === 1 ? "" : "s"}`;
    case "sub_questions":
      return `${counts.subQuestions} sub-question${counts.subQuestions === 1 ? "" : "s"}`;
    case "pcc":
      return "Population, Concept, Context";
    case "scope_notes":
      return "Scope & boundary notes";
    case "papers_matrix":
      return `${counts.kept} kept paper${counts.kept === 1 ? "" : "s"}`;
    case "screening_criteria":
      return `${counts.criteria} criteri${counts.criteria === 1 ? "on" : "a"}`;
    case "prisma":
      return "Identified / screened / included counts";
    case "themes":
      return `${counts.themes} theme${counts.themes === 1 ? "" : "s"}`;
    case "existing_outline":
      return hasOutline.length > 0 ? `Written: ${hasOutline.join(", ")}` : "None written yet";
  }
}

export function OutlineComposer({
  projectId,
  counts,
  hasOutline,
  initialGenerations,
}: {
  projectId: string;
  counts: OutlineCounts;
  hasOutline: OutlineSectionKey[];
  initialGenerations: Generation[];
}) {
  const [selected, setSelected] = React.useState<Set<OutlineSectionId>>(
    new Set(["research_question", "aim_objectives", "papers_matrix", "themes"])
  );
  const [includePending, setIncludePending] = React.useState(false);
  const [target, setTarget] = React.useState<string>("related_work");
  const [customInstructions, setCustomInstructions] = React.useState("");
  const [providers, setProviders] = React.useState<AiProviderName[]>([]);
  const [provider, setProvider] = React.useState<AiProviderName | undefined>(undefined);
  const [generating, setGenerating] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [currentGenerationId, setCurrentGenerationId] = React.useState<string | null>(null);
  const [readOnly, setReadOnly] = React.useState(false);
  const [insertTarget, setInsertTarget] = React.useState<OutlineSectionKey>("related_work");
  const [generations, setGenerations] = React.useState(initialGenerations);
  const [historyOpen, setHistoryOpen] = React.useState(false);

  React.useEffect(() => {
    fetch("/api/ai/config")
      .then((r) => r.json())
      .then((d) => setProviders(d.providers ?? []))
      .catch(() => setProviders([]));
  }, []);

  const toggleSection = (id: OutlineSectionId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const refreshGenerations = React.useCallback(async () => {
    const res = await fetch(`/api/ai/generations?project_id=${projectId}`);
    if (res.ok) {
      const data = await res.json();
      setGenerations(data.generations ?? []);
    }
  }, [projectId]);

  const handleGenerate = async () => {
    setGenerating(true);
    setDraft("");
    setReadOnly(false);
    setCurrentGenerationId(null);
    try {
      const res = await fetch("/api/ai/generate-outline", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          selected_sections: Array.from(selected),
          include_pending_papers: includePending,
          target,
          custom_instructions: target === "custom" ? customInstructions : undefined,
          provider,
        }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Generation failed.");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let text = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        setDraft(text);
      }
      refreshGenerations();
    } catch (err) {
      toast.error("Couldn't generate a draft", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setGenerating(false);
    }
  };

  const handleInsert = async () => {
    try {
      const genId = currentGenerationId ?? generations[0]?.id;
      if (!genId) {
        toast.error("Nothing to insert yet — generate a draft first.");
        return;
      }
      await insertGenerationIntoSection(genId, projectId, insertTarget, draft);
      toast.success(`Inserted into ${insertTarget.replace("_", " ")}. Reload to see it below.`);
    } catch (err) {
      toast.error("Couldn't insert draft", { description: err instanceof Error ? err.message : undefined });
    }
  };

  const loadFromHistory = (g: Generation) => {
    setDraft(g.response_text ?? "");
    setCurrentGenerationId(g.id);
    setReadOnly(true);
    setHistoryOpen(false);
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Compose panel */}
      <Card>
        <CardHeader>
          <CardTitle>Compose</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            {OUTLINE_SECTION_META.map((meta) => (
              <div key={meta.id}>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-1 hover:bg-surface-alt">
                  <Checkbox
                    checked={selected.has(meta.id)}
                    onCheckedChange={() => toggleSection(meta.id)}
                  />
                  <span className="flex-1 text-sm">{meta.label}</span>
                  <span className="text-xs text-text-secondary">
                    {previewFor(meta.id, counts, hasOutline)}
                  </span>
                </label>
                {meta.id === "papers_matrix" && selected.has("papers_matrix") && (
                  <label className="ml-11 flex min-h-9 cursor-pointer items-center gap-2 text-xs text-text-secondary">
                    <Checkbox checked={includePending} onCheckedChange={(v) => setIncludePending(Boolean(v))} />
                    Also include pending papers ({counts.pending})
                  </label>
                )}
              </div>
            ))}
          </div>

          <Separator />

          <div className="flex flex-col gap-1.5">
            <Label>Target</Label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OUTLINE_TARGETS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {target === "custom" && (
            <div className="flex flex-col gap-1.5">
              <Label>Custom instructions</Label>
              <Textarea
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
                rows={3}
              />
            </div>
          )}

          {providers.length > 1 && (
            <div className="flex flex-col gap-1.5">
              <Label>Model</Label>
              <Select value={provider} onValueChange={(v) => setProvider(v as AiProviderName)}>
                <SelectTrigger>
                  <SelectValue placeholder="Default" />
                </SelectTrigger>
                <SelectContent>
                  {providers.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p === "anthropic" ? "Anthropic (Claude)" : "OpenAI"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <Button onClick={handleGenerate} disabled={generating || selected.size === 0}>
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {generating ? "Generating…" : "Generate draft"}
          </Button>
        </CardContent>
      </Card>

      {/* Draft panel */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Draft</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setHistoryOpen((v) => !v)}>
            <History className="h-4 w-4" /> History
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {historyOpen && (
            <div className="max-h-52 overflow-y-auto rounded-md border border-border">
              {generations.length === 0 ? (
                <p className="p-3 text-sm text-text-secondary">No generations yet.</p>
              ) : (
                generations.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => loadFromHistory(g)}
                    className="flex w-full flex-col gap-0.5 border-b border-border p-2.5 text-left text-xs last:border-0 hover:bg-surface-alt"
                  >
                    <div className="flex items-center justify-between text-text-secondary">
                      <span>
                        {g.target} · {g.provider ?? "?"}/{g.model ?? "?"}
                      </span>
                      <span>{formatDistanceToNow(new Date(g.created_at), { addSuffix: true })}</span>
                    </div>
                    <span className="line-clamp-1 text-text-primary">
                      {(g.response_text ?? "").slice(0, 100)}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}

          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            readOnly={readOnly}
            rows={16}
            className={`font-serif ${readOnly ? "bg-surface-alt" : ""}`}
            placeholder="Generated text will stream in here…"
          />
          {readOnly && (
            <Button variant="outline" size="sm" onClick={() => setReadOnly(false)} className="self-start">
              <Pencil className="h-3.5 w-3.5" /> Edit this version
            </Button>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Select value={insertTarget} onValueChange={(v) => setInsertTarget(v as OutlineSectionKey)}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="intro">Introduction</SelectItem>
                <SelectItem value="gap">Research gap</SelectItem>
                <SelectItem value="approach">Proposed approach</SelectItem>
                <SelectItem value="related_work">Related work</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={handleInsert} disabled={!draft}>
              <ArrowDownToLine className="h-4 w-4" /> Insert into section
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => toast.success("Already saved to version history.")}
              disabled={!draft}
            >
              <Save className="h-4 w-4" /> Save as new version
            </Button>
            <Button variant="ghost" size="sm" onClick={handleGenerate} disabled={generating}>
              <RefreshCw className="h-4 w-4" /> Regenerate
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDraft("");
                setCurrentGenerationId(null);
                setReadOnly(false);
              }}
              disabled={!draft}
            >
              <Trash2 className="h-4 w-4" /> Discard
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
