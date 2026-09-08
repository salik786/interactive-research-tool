"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

type ScopeField =
  | "research_question"
  | "aim"
  | "pcc_population"
  | "pcc_concept"
  | "pcc_context"
  | "scope_notes";

export async function updateScopeField(projectId: string, field: ScopeField, value: string) {
  const supabase = await createClient();
  const payload: Partial<Tables<"projects">> = { [field]: value };
  const { error } = await supabase.from("projects").update(payload).eq("id", projectId);
  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${projectId}/scope`);
  revalidatePath(`/projects/${projectId}/overview`);
}

export async function addObjective(projectId: string, content: string, position: number) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_objectives")
    .insert({ project_id: projectId, content, position })
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${projectId}/scope`);
  return data;
}

export async function updateObjective(id: string, content: string, projectId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("project_objectives").update({ content }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${projectId}/scope`);
}

export async function deleteObjective(id: string, projectId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("project_objectives").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${projectId}/scope`);
}

export async function reorderObjectives(projectId: string, orderedIds: string[]) {
  const supabase = await createClient();
  const results = await Promise.all(
    orderedIds.map((id, position) =>
      supabase.from("project_objectives").update({ position }).eq("id", id)
    )
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);
  revalidatePath(`/projects/${projectId}/scope`);
}

export async function addSubQuestion(projectId: string, content: string, position: number) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_sub_questions")
    .insert({ project_id: projectId, content, position })
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${projectId}/scope`);
  return data;
}

export async function updateSubQuestion(id: string, content: string, projectId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("project_sub_questions").update({ content }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${projectId}/scope`);
}

export async function deleteSubQuestion(id: string, projectId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("project_sub_questions").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${projectId}/scope`);
}

export async function reorderSubQuestions(projectId: string, orderedIds: string[]) {
  const supabase = await createClient();
  const results = await Promise.all(
    orderedIds.map((id, position) =>
      supabase.from("project_sub_questions").update({ position }).eq("id", id)
    )
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);
  revalidatePath(`/projects/${projectId}/scope`);
}
