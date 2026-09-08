import { requireProjectContext } from "@/lib/data/projects";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { PrismaFlowEditor } from "./prisma-flow-editor";

export default async function PrismaFlowPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { project } = await requireProjectContext(id);
  const supabase = await createClient();

  const { data: projectSources } = await supabase
    .from("project_sources")
    .select("status, exclusion_reason")
    .eq("project_id", id);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="PRISMA flow"
        description="Manual counts for the top of the funnel; everything below is computed live from your paper matrix."
      />
      <div className="p-4 sm:p-8">
        <PrismaFlowEditor project={project} projectSources={projectSources ?? []} />
      </div>
    </div>
  );
}
