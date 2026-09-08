import { requireProjectContext } from "@/lib/data/projects";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileStack, CheckCircle2, Clock, XCircle, Layers, ListTree, FlaskConical } from "lucide-react";

export default async function OverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { project } = await requireProjectContext(id);
  const supabase = await createClient();

  const [
    { data: paperStatuses },
    { count: blocksCount },
    { count: testsCount },
  ] = await Promise.all([
    supabase.from("project_sources").select("status, theme").eq("project_id", id),
    supabase.from("search_blocks").select("id", { count: "exact", head: true }).eq("project_id", id),
    supabase.from("search_tests").select("id", { count: "exact", head: true }).eq("project_id", id),
  ]);

  const total = paperStatuses?.length ?? 0;
  const kept = (paperStatuses ?? []).filter((p) => p.status === "keep").length;
  const pending = (paperStatuses ?? []).filter((p) => p.status === "pending").length;
  const excluded = (paperStatuses ?? []).filter((p) => p.status === "excluded").length;

  const themeCounts = new Map<string, number>();
  for (const p of paperStatuses ?? []) {
    if (p.status !== "keep") continue;
    const theme = p.theme?.trim() || "Uncategorised";
    themeCounts.set(theme, (themeCounts.get(theme) ?? 0) + 1);
  }
  const themes = Array.from(themeCounts.entries()).sort((a, b) => b[1] - a[1]);

  const stats = [
    { label: "Papers logged", value: total, icon: FileStack },
    { label: "Kept", value: kept, icon: CheckCircle2 },
    { label: "Pending", value: pending, icon: Clock },
    { label: "Excluded", value: excluded, icon: XCircle },
    { label: "Themes", value: themes.length, icon: Layers },
    { label: "Search blocks", value: blocksCount ?? 0, icon: ListTree },
    { label: "Query attempts", value: testsCount ?? 0, icon: FlaskConical },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Overview" description="A snapshot of where this review stands." />
      <div className="flex flex-col gap-8 p-4 sm:p-8">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {stats.map((s) => (
            <Card key={s.label}>
              <CardContent className="flex flex-col gap-2 p-4">
                <div className="flex items-center gap-2 text-text-secondary">
                  <s.icon className="h-4 w-4" />
                  <span className="text-xs font-medium">{s.label}</span>
                </div>
                <span className="font-serif text-2xl font-semibold">{s.value}</span>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Research question</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-text-secondary">
              {project.research_question || "No research question set yet — head to Scope & PCC."}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Themes at a glance</CardTitle>
          </CardHeader>
          <CardContent>
            {themes.length === 0 ? (
              <p className="text-sm text-text-secondary">No themes yet — mark papers as Keep to see them here.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {themes.map(([name, count]) => (
                  <li key={name} className="flex items-center justify-between py-2 text-sm">
                    <span>{name}</span>
                    <span className="font-medium text-text-secondary">{count} papers</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
