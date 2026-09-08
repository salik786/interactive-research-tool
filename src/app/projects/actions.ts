"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface CreateProjectResult {
  error?: string;
}

export async function createProject(
  _prev: CreateProjectResult,
  formData: FormData
): Promise<CreateProjectResult> {
  const name = String(formData.get("name") ?? "").trim();
  const researchQuestion = String(formData.get("researchQuestion") ?? "").trim();

  if (!name) return { error: "Give the project a name." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { data: project, error } = await supabase
    .from("projects")
    .insert({ name, owner_id: user.id, research_question: researchQuestion })
    .select("id")
    .single();

  if (error || !project) return { error: error?.message ?? "Could not create the project." };

  revalidatePath("/projects");
  redirect(`/projects/${project.id}/overview`);
}

export async function renameProject(projectId: string, name: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("projects").update({ name }).eq("id", projectId);
  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
}

export async function deleteProject(projectId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("projects").delete().eq("id", projectId);
  if (error) throw new Error(error.message);
  revalidatePath("/projects");
  redirect("/projects");
}
