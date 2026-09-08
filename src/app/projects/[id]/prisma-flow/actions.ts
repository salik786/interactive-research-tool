"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

type CountField = "identified_count" | "duplicates_removed_count" | "excluded_screening_count";

export async function updatePrismaCount(projectId: string, field: CountField, value: number | null) {
  const supabase = await createClient();
  const payload: Partial<Tables<"projects">> = { [field]: value };
  const { error } = await supabase.from("projects").update(payload).eq("id", projectId);
  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${projectId}/prisma-flow`);
}
