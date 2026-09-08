"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserPlus, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import type { Tables, ProjectRole } from "@/types/database";
import { inviteMember, updateMemberRole, removeMember, revokeInvite } from "./actions";

type Member = Tables<"project_members"> & {
  profiles: Pick<Tables<"profiles">, "id" | "email" | "full_name"> | null;
};
type Invite = Tables<"pending_invites">;

export function MembersPanel({
  projectId,
  currentUserId,
  isOwner,
  members,
  invites,
}: {
  projectId: string;
  currentUserId: string;
  isOwner: boolean;
  members: Member[];
  invites: Invite[];
}) {
  const router = useRouter();
  const [memberList, setMemberList] = React.useState(members);
  const [inviteList, setInviteList] = React.useState(invites);
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<ProjectRole>("editor");
  const [inviting, setInviting] = React.useState(false);

  // Re-sync local state when router.refresh() re-fetches server props (e.g. after inviting).
  /* eslint-disable react-hooks/set-state-in-effect */
  React.useEffect(() => setMemberList(members), [members]);
  React.useEffect(() => setInviteList(invites), [invites]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviting(true);
    try {
      const result = await inviteMember(projectId, email, role);
      if (result.error) throw new Error(result.error);
      toast.success(
        result.status === "added" ? "Added to the project." : "Invited — they'll join automatically when they sign up."
      );
      setEmail("");
      router.refresh();
    } catch (err) {
      toast.error("Couldn't invite", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: ProjectRole) => {
    setMemberList((prev) => prev.map((m) => (m.user_id === userId ? { ...m, role: newRole } : m)));
    try {
      await updateMemberRole(projectId, userId, newRole);
    } catch (err) {
      toast.error("Couldn't update role", { description: err instanceof Error ? err.message : undefined });
    }
  };

  const handleRemove = async (userId: string) => {
    const prev = memberList;
    setMemberList((p) => p.filter((m) => m.user_id !== userId));
    try {
      await removeMember(projectId, userId);
    } catch (err) {
      setMemberList(prev);
      toast.error("Couldn't remove member", { description: err instanceof Error ? err.message : undefined });
    }
  };

  const handleRevoke = async (id: string) => {
    const prev = inviteList;
    setInviteList((p) => p.filter((i) => i.id !== id));
    try {
      await revokeInvite(id, projectId);
    } catch (err) {
      setInviteList(prev);
      toast.error("Couldn't revoke invite", { description: err instanceof Error ? err.message : undefined });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Members</CardTitle>
        <CardDescription>Everyone on this project sees edits live.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ul className="flex flex-col divide-y divide-border">
          {memberList.map((m) => (
            <li key={m.user_id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {m.profiles?.full_name || m.profiles?.email || "Unknown user"}
                  {m.user_id === currentUserId && <span className="text-text-secondary"> (you)</span>}
                </p>
                <p className="truncate text-xs text-text-secondary">{m.profiles?.email}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {isOwner && m.role !== "owner" ? (
                  <Select value={m.role} onValueChange={(v) => handleRoleChange(m.user_id, v as ProjectRole)}>
                    <SelectTrigger className="h-9 w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="editor">Editor</SelectItem>
                      <SelectItem value="viewer">Viewer</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge variant="secondary" className="capitalize">
                    {m.role}
                  </Badge>
                )}
                {isOwner && m.role !== "owner" && (
                  <Button variant="ghost" size="icon" onClick={() => handleRemove(m.user_id)} aria-label="Remove member">
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </li>
          ))}
          {inviteList.map((invite) => (
            <li key={invite.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{invite.email}</p>
                <p className="text-xs text-text-secondary">Pending — joins automatically on sign-up</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant="secondary" className="capitalize">
                  {invite.role}
                </Badge>
                {isOwner && (
                  <Button variant="ghost" size="icon" onClick={() => handleRevoke(invite.id)} aria-label="Revoke invite">
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>

        <form onSubmit={handleInvite} className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="colleague@university.edu"
            required
            className="flex-1"
          />
          <Select value={role} onValueChange={(v) => setRole(v as ProjectRole)}>
            <SelectTrigger className="sm:w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="editor">Editor</SelectItem>
              <SelectItem value="viewer">Viewer</SelectItem>
            </SelectContent>
          </Select>
          <Button type="submit" disabled={inviting}>
            <UserPlus className="h-4 w-4" /> Invite
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
