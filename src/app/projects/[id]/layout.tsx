import { requireProjectContext } from "@/lib/data/projects";
import { ProjectShell } from "@/components/project/project-shell";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { project } = await requireProjectContext(id);

  return (
    <ProjectShell projectId={id} projectName={project.name}>
      {children}
    </ProjectShell>
  );
}
