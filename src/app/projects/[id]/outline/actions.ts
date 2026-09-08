"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { OutlineSectionKey } from "@/types/database";

export async function saveOutlineSection(projectId: string, sectionKey: OutlineSectionKey, content: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("outline_sections")
    .upsert({ project_id: projectId, section_key: sectionKey, content }, { onConflict: "project_id,section_key" });
  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${projectId}/outline`);
}

export async function insertGenerationIntoSection(
  generationId: string,
  projectId: string,
  sectionKey: OutlineSectionKey,
  content: string
) {
  const supabase = await createClient();
  const { error: upsertError } = await supabase
    .from("outline_sections")
    .upsert({ project_id: projectId, section_key: sectionKey, content }, { onConflict: "project_id,section_key" });
  if (upsertError) throw new Error(upsertError.message);

  const { error: updateError } = await supabase
    .from("ai_generations")
    .update({ inserted_into: sectionKey })
    .eq("id", generationId);
  if (updateError) throw new Error(updateError.message);

  revalidatePath(`/projects/${projectId}/outline`);
}
