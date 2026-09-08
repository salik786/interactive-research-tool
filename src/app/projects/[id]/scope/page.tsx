import { requireProjectContext } from "@/lib/data/projects";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { ScopeForm } from "./scope-form";

export default async function ScopePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { project } = await requireProjectContext(id);
  const supabase = await createClient();

  const [{ data: objectives }, { data: subQuestions }] = await Promise.all([
    supabase.from("project_objectives").select("*").eq("project_id", id).order("position"),
    supabase.from("project_sub_questions").select("*").eq("project_id", id).order("position"),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Scope & PCC"
        description="Entirely human-authored — this is where the review becomes yours."
      />
      <div className="p-4 sm:p-8">
        <ScopeForm
          project={project}
          objectives={objectives ?? []}
          subQuestions={subQuestions ?? []}
        />
      </div>
    </div>
  );
}
