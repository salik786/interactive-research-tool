"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { CriterionType, SourceStatus } from "@/types/database";

// ---- Screening criteria ----

export async function addCriterion(projectId: string, type: CriterionType, content: string, position: number) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("screening_criteria")
    .insert({ project_id: projectId, type, content, position })
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${projectId}/papers`);
  return data;
}

export async function deleteCriterion(id: string, projectId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("screening_criteria").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${projectId}/papers`);
}

// ---- Papers (sources + project_sources) ----

export interface PaperFormInput {
  citation: string;
  doi?: string;
  method: string;
  dataset: string;
  key_result: string;
  theme: string;
  relevance_note: string;
  status: SourceStatus;
  exclusion_reason: string;
}

/**
 * Adds a paper to this project. Upserts into the shared `sources` library
 * (dedupe by DOI if present, else exact citation match) and links it via
 * `project_sources` — all in one transaction via a Postgres function would
 * be ideal, but Supabase JS doesn't expose multi-statement transactions, so
 * we do it as two dependent calls guarded by the DOI/citation lookup below.
 */
export async function addPaper(projectId: string, input: PaperFormInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  let sourceId: string | null = null;

  if (input.doi) {
    const { data: existing } = await supabase
      .from("sources")
      .select("id")
      .eq("doi", input.doi)
      .eq("library_owner_id", user.id)
      .maybeSingle();
    sourceId = existing?.id ?? null;
  }
  if (!sourceId) {
    const { data: existing } = await supabase
      .from("sources")
      .select("id")
      .eq("citation", input.citation)
      .eq("library_owner_id", user.id)
      .maybeSingle();
    sourceId = existing?.id ?? null;
  }

  if (!sourceId) {
    const { data: created, error } = await supabase
      .from("sources")
      .insert({ citation: input.citation, doi: input.doi || null, library_owner_id: user.id })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    sourceId = created.id;
  }

  const { data: projectSource, error } = await supabase
    .from("project_sources")
    .upsert(
      {
        project_id: projectId,
        source_id: sourceId,
        method: input.method,
        dataset: input.dataset,
        key_result: input.key_result,
        theme: input.theme,
        status: input.status,
        exclusion_reason: input.status === "excluded" ? input.exclusion_reason : null,
        relevance_note: input.relevance_note,
        added_by: user.id,
      },
      { onConflict: "project_id,source_id" }
    )
    .select("*, sources(*)")
    .single();

  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${projectId}/papers`);
  revalidatePath(`/projects/${projectId}/prisma-flow`);
  revalidatePath(`/projects/${projectId}/themes`);
  revalidatePath(`/projects/${projectId}/overview`);
  return projectSource;
}

export async function updatePaper(projectSourceId: string, projectId: string, input: PaperFormInput) {
  const supabase = await createClient();

  const { data: ps } = await supabase
    .from("project_sources")
    .select("source_id")
    .eq("id", projectSourceId)
    .single();

  if (ps) {
    await supabase
      .from("sources")
      .update({ citation: input.citation, doi: input.doi || null })
      .eq("id", ps.source_id);
  }

  const { error } = await supabase
    .from("project_sources")
    .update({
      method: input.method,
      dataset: input.dataset,
      key_result: input.key_result,
      theme: input.theme,
      status: input.status,
      exclusion_reason: input.status === "excluded" ? input.exclusion_reason : null,
      relevance_note: input.relevance_note,
    })
    .eq("id", projectSourceId);

  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${projectId}/papers`);
  revalidatePath(`/projects/${projectId}/prisma-flow`);
  revalidatePath(`/projects/${projectId}/themes`);
}

export async function deletePaper(projectSourceId: string, projectId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("project_sources").delete().eq("id", projectSourceId);
  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${projectId}/papers`);
  revalidatePath(`/projects/${projectId}/prisma-flow`);
}
