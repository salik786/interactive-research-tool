import { requireProjectContext } from "@/lib/data/projects";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { CriteriaList } from "./criteria-list";
import { PapersBoard } from "./papers-board";

export default async function PapersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireProjectContext(id);
  const supabase = await createClient();

  const [{ data: criteria }, { data: paperRows }] = await Promise.all([
    supabase.from("screening_criteria").select("*").eq("project_id", id).order("position"),
    supabase
      .from("project_sources")
      .select("*, sources(*)")
      .eq("project_id", id)
      .order("created_at", { ascending: false }),
  ]);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Papers & screening"
        description="Your project's paper matrix — triaged from the shared library."
      />
      <div className="flex flex-col gap-8 p-4 sm:p-8">
        <CriteriaList projectId={id} initialCriteria={criteria ?? []} />
        <PapersBoard projectId={id} initialPapers={paperRows ?? []} />
      </div>
    </div>
  );
}
