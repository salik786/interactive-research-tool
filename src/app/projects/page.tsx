import Link from "next/link";
import { FolderOpen } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { NewProjectDialog } from "./new-project-dialog";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UserMenu } from "@/components/user-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { formatDistanceToNow } from "date-fns";

export default async function ProjectsDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("project_members")
    .select("role, projects(id, name, research_question, updated_at, owner_id)")
    .eq("user_id", user.id);

  const projectIds = (memberships ?? [])
    .map((m) => (m.projects as unknown as { id: string } | null)?.id)
    .filter((id): id is string => Boolean(id));

  let paperCounts = new Map<string, number>();
  if (projectIds.length > 0) {
    const { data: sourceRows } = await supabase
      .from("project_sources")
      .select("project_id")
      .in("project_id", projectIds);
    paperCounts = (sourceRows ?? []).reduce((map, row) => {
      map.set(row.project_id, (map.get(row.project_id) ?? 0) + 1);
      return map;
    }, new Map<string, number>());
  }

  const projects = (memberships ?? [])
    .map((m) => ({
      role: m.role,
      project: m.projects as unknown as {
        id: string;
        name: string;
        research_question: string;
        updated_at: string;
        owner_id: string;
      } | null,
    }))
    .filter((p) => p.project);

  return (
    <div className="min-h-screen bg-bg">
      <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-4 sm:px-8">
        <span className="font-serif text-lg font-semibold">Review Workbench</span>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <UserMenu email={user.email ?? ""} />
        </div>
      </div>
      <PageHeader
        title="Your projects"
        description="Every literature review you own or collaborate on."
        actions={<NewProjectDialog />}
      />

      <div className="p-4 sm:p-8">
        {projects.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map(({ role, project }) => (
              <Link key={project!.id} href={`/projects/${project!.id}/overview`}>
                <Card className="h-full transition-colors duration-150 hover:border-primary/40">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="line-clamp-2">{project!.name}</CardTitle>
                      <Badge variant={role === "owner" ? "default" : "secondary"} className="shrink-0 capitalize">
                        {role}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    <p className="line-clamp-2 text-sm text-text-secondary">
                      {project!.research_question || "No research question set yet."}
                    </p>
                    <div className="flex items-center justify-between text-xs text-text-secondary">
                      <span>{paperCounts.get(project!.id) ?? 0} papers</span>
                      <span>Updated {formatDistanceToNow(new Date(project!.updated_at), { addSuffix: true })}</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border bg-surface px-6 py-20 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
        <FolderOpen className="h-6 w-6" />
      </div>
      <div>
        <h2 className="font-serif text-lg font-semibold">No projects yet</h2>
        <p className="mt-1 max-w-sm text-sm text-text-secondary">
          Create your first literature review project to start building your search strategy,
          paper matrix, and outline.
        </p>
      </div>
      <NewProjectDialog />
    </div>
  );
}
