"use server";

import { createClient } from "@/lib/supabase/server";

/** Saves the project's single LaTeX source (one row per project). */
export async function saveLatexDocument(projectId: string, content: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  // No .select() — we don't need the row back, and not requesting a
  // representation keeps this independent of the SELECT policy.
  const { error } = await supabase
    .from("latex_documents")
    .upsert({ project_id: projectId, content, updated_by: user.id }, { onConflict: "project_id" });

  if (error) throw new Error(error.message);
}
