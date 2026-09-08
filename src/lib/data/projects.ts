import "server-only";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ProjectRole } from "@/types/database";

export interface ProjectContext {
  project: {
    id: string;
    owner_id: string;
    name: string;
    research_question: string;
    aim: string;
    pcc_population: string;
    pcc_concept: string;
    pcc_context: string;
    scope_notes: string;
    identified_count: number | null;
    duplicates_removed_count: number | null;
    excluded_screening_count: number | null;
    created_at: string;
    updated_at: string;
  };
  role: ProjectRole;
  userId: string;
}

/** Loads a project for the current user, enforcing membership via RLS. */
export async function requireProjectContext(projectId: string): Promise<ProjectContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data: project, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .maybeSingle();

  if (error || !project) notFound();

  const { data: membership } = await supabase
    .from("project_members")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) notFound();

  return { project, role: membership.role as ProjectRole, userId: user.id };
}
