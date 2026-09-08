import { requireProjectContext } from "@/lib/data/projects";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { ThemesBoard } from "./themes-board";
import type { Tables } from "@/types/database";

const UNCATEGORISED = "Uncategorised";

type PaperRow = Tables<"project_sources"> & { sources: Tables<"sources"> | null };

export default async function ThemesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireProjectContext(id);
  const supabase = await createClient();

  const [{ data: keptPapers }, { data: syntheses }] = await Promise.all([
    supabase
      .from("project_sources")
      .select("*, sources(*)")
      .eq("project_id", id)
      .eq("status", "keep"),
    supabase.from("theme_synthesis").select("*").eq("project_id", id),
  ]);

  const grouped = new Map<string, PaperRow[]>();
  for (const paper of (keptPapers ?? []) as PaperRow[]) {
    const theme = paper.theme?.trim() || UNCATEGORISED;
    if (!grouped.has(theme)) grouped.set(theme, []);
    grouped.get(theme)!.push(paper);
  }

  const themes = Array.from(grouped.entries())
    .map(([name, papers]) => ({
      name,
      papers,
      synthesis: (syntheses ?? []).find((s) => s.theme_name === name)?.content ?? "",
    }))
    .sort((a, b) => (a.name === UNCATEGORISED ? 1 : b.name === UNCATEGORISED ? -1 : a.name.localeCompare(b.name)));

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Themes"
        description="Auto-derived from kept papers, grouped by theme. Draft a synthesis for each."
      />
      <div className="p-4 sm:p-8">
        <ThemesBoard projectId={id} themes={themes} />
      </div>
    </div>
  );
}
