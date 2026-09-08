import { requireProjectContext } from "@/lib/data/projects";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { MembersPanel } from "./members-panel";
import { DangerZone } from "./danger-zone";

export default async function ProjectSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { project, role, userId } = await requireProjectContext(id);
  const supabase = await createClient();

  const [{ data: members }, { data: invites }] = await Promise.all([
    supabase
      .from("project_members")
      .select("*, profiles(id, email, full_name)")
      .eq("project_id", id),
    supabase.from("pending_invites").select("*").eq("project_id", id),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Project settings" description="Manage collaborators and project-level danger zone actions." />
      <div className="flex flex-col gap-8 p-4 sm:p-8">
        <MembersPanel
          projectId={id}
          currentUserId={userId}
          isOwner={role === "owner"}
          members={members ?? []}
          invites={invites ?? []}
        />
        {role === "owner" && <DangerZone projectId={id} projectName={project.name} />}
      </div>
    </div>
  );
}
