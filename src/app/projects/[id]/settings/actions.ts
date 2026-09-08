"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ProjectRole } from "@/types/database";

export interface InviteResult {
  error?: string;
  status?: "added" | "pending";
}

export async function inviteMember(projectId: string, email: string, role: ProjectRole): Promise<InviteResult> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) return { error: "Enter an email address." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  // Look for an existing account with this email via the admin API (no
  // service-role-backed email lookup exists in PostgREST, so we scan the
  // first page of users — fine for a small research-team tool).
  let matchedUserId: string | null = null;
  try {
    const admin = createAdminClient();
    const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    matchedUserId = data.users.find((u) => u.email?.toLowerCase() === trimmed)?.id ?? null;
  } catch {
    matchedUserId = null;
  }

  if (matchedUserId) {
    const { error } = await supabase
      .from("project_members")
      .upsert({ project_id: projectId, user_id: matchedUserId, role }, { onConflict: "project_id,user_id" });
    if (error) return { error: error.message };
    revalidatePath(`/projects/${projectId}/settings`);
    return { status: "added" };
  }

  const { error } = await supabase
    .from("pending_invites")
    .insert({ project_id: projectId, email: trimmed, role, invited_by: user.id });
  if (error) return { error: error.message };
  revalidatePath(`/projects/${projectId}/settings`);
  return { status: "pending" };
}

export async function updateMemberRole(projectId: string, userId: string, role: ProjectRole) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("project_members")
    .update({ role })
    .eq("project_id", projectId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${projectId}/settings`);
}

export async function removeMember(projectId: string, userId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("project_members")
    .delete()
    .eq("project_id", projectId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${projectId}/settings`);
}

export async function revokeInvite(inviteId: string, projectId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("pending_invites").delete().eq("id", inviteId);
  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${projectId}/settings`);
}
