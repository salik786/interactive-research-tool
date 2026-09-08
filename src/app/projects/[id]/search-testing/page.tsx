import { requireProjectContext } from "@/lib/data/projects";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { SearchTestingBoard } from "./search-testing-board";

export default async function SearchTestingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireProjectContext(id);
  const supabase = await createClient();

  const { data: tests } = await supabase
    .from("search_tests")
    .select("*")
    .eq("project_id", id)
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Search testing"
        description="Log pilot searches across databases and decide whether the strategy is ready."
      />
      <div className="p-4 sm:p-8">
        <SearchTestingBoard projectId={id} initialTests={tests ?? []} />
      </div>
    </div>
  );
}
