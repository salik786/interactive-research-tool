import { requireProjectContext } from "@/lib/data/projects";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { buildLatexDocument, type LatexProjectInput } from "@/lib/latex/generate";
import type { Tables } from "@/types/database";
import { LatexWorkspace } from "./latex-workspace";

type PaperRow = Tables<"project_sources"> & { sources: Tables<"sources"> | null };
const UNCATEGORISED = "Uncategorised";

export default async function LatexPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { project } = await requireProjectContext(id);
  const supabase = await createClient();

  const [docResult, { data: outline }, { data: syntheses }, { data: keptRows }] = await Promise.all([
    supabase.from("latex_documents").select("content").eq("project_id", id).maybeSingle(),
    supabase.from("outline_sections").select("*").eq("project_id", id),
    supabase.from("theme_synthesis").select("*").eq("project_id", id),
    supabase
      .from("project_sources")
      .select("*, sources(*)")
      .eq("project_id", id)
      .eq("status", "keep")
      .order("created_at", { ascending: true }),
  ]);

  // The table comes from supabase/migrations/0002_latex_documents.sql. If it
  // hasn't been applied yet, the editor still works — it just can't save.
  const storageError = docResult.error ? docResult.error.message : null;

  const sectionText = (key: string) => (outline ?? []).find((o) => o.section_key === key)?.content ?? "";
  const kept = (keptRows ?? []) as PaperRow[];

  const references = kept.map((p, i) => ({
    key: `ref${i + 1}`,
    citation: p.sources?.citation ?? "Untitled",
  }));

  const byTheme = new Map<string, string[]>();
  kept.forEach((p, i) => {
    const theme = p.theme?.trim() || UNCATEGORISED;
    byTheme.set(theme, [...(byTheme.get(theme) ?? []), `ref${i + 1}`]);
  });
  const themes: LatexProjectInput["themes"] = Array.from(byTheme.entries())
    .sort(([a], [b]) => (a === UNCATEGORISED ? 1 : b === UNCATEGORISED ? -1 : a.localeCompare(b)))
    .map(([name, citationKeys]) => ({
      name,
      citationKeys,
      synthesis: (syntheses ?? []).find((s) => s.theme_name === name)?.content ?? "",
    }));

  const template = buildLatexDocument({
    projectName: project.name,
    researchQuestion: project.research_question,
    aim: project.aim,
    sections: {
      intro: sectionText("intro"),
      gap: sectionText("gap"),
      approach: sectionText("approach"),
      related_work: sectionText("related_work"),
    },
    themes,
    references,
  });

  const saved = docResult.data?.content;

  return (
    <div className="mx-auto max-w-[1800px]">
      <PageHeader
        title="LaTeX editor"
        description="Write in LaTeX, preview the PDF, and export .tex, .pdf or Word (.docx)."
      />
      <LatexWorkspace
        projectId={id}
        projectName={project.name}
        initialContent={saved && saved.trim() ? saved : template}
        template={template}
        hasSavedDocument={Boolean(saved && saved.trim())}
        storageError={storageError}
      />
    </div>
  );
}
