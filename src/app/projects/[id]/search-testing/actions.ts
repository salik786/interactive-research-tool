"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { SearchDecision } from "@/types/database";

export interface SearchTestInput {
  database: string;
  version_label: string;
  results_count: string;
  relevance_pct: string;
  seed_papers_captured: string;
  decision: SearchDecision;
  query_string: string;
  notes: string;
}

export async function createSearchTest(projectId: string, input: SearchTestInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("search_tests")
    .insert({ project_id: projectId, ...input, created_by: user?.id })
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${projectId}/search-testing`);
  return data;
}

export async function updateSearchTest(id: string, projectId: string, input: SearchTestInput) {
  const supabase = await createClient();
  const { error } = await supabase.from("search_tests").update(input).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${projectId}/search-testing`);
}

export async function deleteSearchTest(id: string, projectId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("search_tests").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${projectId}/search-testing`);
}
