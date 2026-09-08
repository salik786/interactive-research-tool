import { requireProjectContext } from "@/lib/data/projects";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { SearchBlocksEditor } from "./search-blocks-editor";

export default async function SearchBlocksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireProjectContext(id);
  const supabase = await createClient();

  const { data: blocks } = await supabase
    .from("search_blocks")
    .select("*")
    .eq("project_id", id)
    .order("position");

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Search blocks"
        description="Deterministic, auditable boolean query — no AI. Terms in a block combine with OR; blocks combine with AND."
      />
      <div className="p-4 sm:p-8">
        <SearchBlocksEditor projectId={id} initialBlocks={blocks ?? []} />
      </div>
    </div>
  );
}
