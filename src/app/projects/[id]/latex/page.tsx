import { requireProjectContext } from "@/lib/data/projects";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { buildLatexDocument, type LatexProjectInput } from "@/lib/latex/generate";
import type { Tables } from "@/types/database";
import { rowToFile, type ProjectFile } from "@/lib/latex/store";
import { LatexWorkspace } from "./latex-workspace";

type PaperRow = Tables<"project_sources"> & { sources: Tables<"sources"> | null };
const UNCATEGORISED = "Uncategorised";

export default async function LatexPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { project } = await requireProjectContext(id);
  const supabase = await createClient();

  const [filesResult, settingsResult, { data: outline }, { data: syntheses }, { data: keptRows }] = await Promise.all([
    supabase.from("latex_files").select("*").eq("project_id", id).order("path", { ascending: true }),
    supabase.from("latex_settings").select("main_file").eq("project_id", id).maybeSingle(),
    supabase.from("outline_sections").select("*").eq("project_id", id),
    supabase.from("theme_synthesis").select("*").eq("project_id", id),
    supabase
      .from("project_sources")
      .select("*, sources(*)")
      .eq("project_id", id)
      .eq("status", "keep")
      .order("created_at", { ascending: true }),
  ]);

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

  // Tables/bucket come from supabase/migrations/0003_latex_project_files.sql. If they
  // haven't been applied yet, the editor still works (in memory) — it just can't save.
  let storageError: string | null = filesResult.error ? filesResult.error.message : null;
  let initialFiles: ProjectFile[] = (filesResult.data ?? []).map(rowToFile);
  let initialMain: string | null = settingsResult.data?.main_file ?? null;

  if (!storageError && initialFiles.length === 0) {
    // First visit: seed main.tex — from the older single-document editor's saved text if
    // there is one (migration 0002), otherwise from the generated project template.
    const { data: legacy } = await supabase.from("latex_documents").select("content").eq("project_id", id).maybeSingle();
    const seed = legacy?.content && legacy.content.trim() ? legacy.content : template;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    // ignoreDuplicates: two collaborators opening the page at once must not clobber each other.
    const seeded = await supabase
      .from("latex_files")
      .upsert(
        { project_id: id, path: "main.tex", kind: "text", content: seed, mime_type: "application/x-tex", size_bytes: seed.length, updated_by: user?.id ?? null },
        { onConflict: "project_id,path", ignoreDuplicates: true }
      );
    if (seeded.error) {
      storageError = seeded.error.message;
    } else {
      await supabase
        .from("latex_settings")
        .upsert({ project_id: id, main_file: "main.tex", updated_by: user?.id ?? null }, { onConflict: "project_id", ignoreDuplicates: true });
      const again = await supabase.from("latex_files").select("*").eq("project_id", id).order("path", { ascending: true });
      initialFiles = (again.data ?? []).map(rowToFile);
      initialMain = initialMain ?? "main.tex";
    }
  }

  if (storageError) {
    // Fallback so the editor is still usable: an unsaved, in-memory main.tex.
    initialFiles = [
      { id: "unsaved-main", path: "main.tex", kind: "text", mime: "application/x-tex", size: template.length, storagePath: null, content: template, updatedAt: "" },
    ];
    initialMain = "main.tex";
  }

  return (
    <div className="mx-auto max-w-[1800px]">
      <PageHeader
        title="LaTeX editor"
        description="Write, compile and export your paper."
      />
      <LatexWorkspace
        projectId={id}
        projectName={project.name}
        template={template}
        initialFiles={initialFiles}
        initialMain={initialMain}
        storageError={storageError}
      />
    </div>
  );
}
