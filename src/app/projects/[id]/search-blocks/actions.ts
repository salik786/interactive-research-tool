"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function addSearchBlock(projectId: string, name: string, position: number) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("search_blocks")
    .insert({ project_id: projectId, name, position, terms: [] })
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${projectId}/search-blocks`);
  return data;
}

export async function renameSearchBlock(id: string, projectId: string, name: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("search_blocks").update({ name }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${projectId}/search-blocks`);
}

export async function updateSearchBlockTerms(id: string, projectId: string, terms: string[]) {
  const supabase = await createClient();
  const { error } = await supabase.from("search_blocks").update({ terms }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${projectId}/search-blocks`);
}

export async function deleteSearchBlock(id: string, projectId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("search_blocks").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${projectId}/search-blocks`);
}
