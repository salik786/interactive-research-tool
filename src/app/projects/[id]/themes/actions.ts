"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function saveThemeSynthesis(projectId: string, themeName: string, content: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("theme_synthesis")
    .upsert({ project_id: projectId, theme_name: themeName, content }, { onConflict: "project_id,theme_name" });
  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${projectId}/themes`);
}
