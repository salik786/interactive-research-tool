import { requireProjectContext } from "@/lib/data/projects";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { OutlinePageClient } from "./outline-page-client";
import type { OutlineSectionKey } from "@/types/database";

const SECTION_KEYS: OutlineSectionKey[] = ["intro", "gap", "approach", "related_work"];

export default async function OutlinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { project } = await requireProjectContext(id);
  const supabase = await createClient();

  const [
    { count: objectivesCount },
    { count: subQuestionsCount },
    { count: keptCount },
    { count: pendingCount },
    { count: criteriaCount },
    { data: keptThemes },
    { data: outlineSections },
    { data: generations },
  ] = await Promise.all([
    supabase.from("project_objectives").select("id", { count: "exact", head: true }).eq("project_id", id),
    supabase.from("project_sub_questions").select("id", { count: "exact", head: true }).eq("project_id", id),
    supabase
      .from("project_sources")
      .select("id", { count: "exact", head: true })
      .eq("project_id", id)
      .eq("status", "keep"),
    supabase
      .from("project_sources")
      .select("id", { count: "exact", head: true })
      .eq("project_id", id)
      .eq("status", "pending"),
    supabase.from("screening_criteria").select("id", { count: "exact", head: true }).eq("project_id", id),
    supabase.from("project_sources").select("theme").eq("project_id", id).eq("status", "keep"),
    supabase.from("outline_sections").select("*").eq("project_id", id),
    supabase
      .from("ai_generations")
      .select("*")
      .eq("project_id", id)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  const { data: themeSyntheses } = await supabase
    .from("theme_synthesis")
    .select("theme_name, content")
    .eq("project_id", id);

  const themeCount = new Set((keptThemes ?? []).map((t) => t.theme?.trim() || "Uncategorised")).size;

  const sectionsMap = new Map(SECTION_KEYS.map((k) => [k, ""]));
  for (const s of outlineSections ?? []) sectionsMap.set(s.section_key, s.content);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Paper outline"
        description="Compose structured drafts from what you've already produced, then write the rest by hand."
      />
      <div className="p-4 sm:p-8">
        <OutlinePageClient
          projectId={id}
          projectName={project.name}
          counts={{
            objectives: objectivesCount ?? 0,
            subQuestions: subQuestionsCount ?? 0,
            kept: keptCount ?? 0,
            pending: pendingCount ?? 0,
            criteria: criteriaCount ?? 0,
            themes: themeCount,
          }}
          sections={Object.fromEntries(sectionsMap) as Record<OutlineSectionKey, string>}
          generations={generations ?? []}
          themeSyntheses={themeSyntheses ?? []}
        />
      </div>
    </div>
  );
}
