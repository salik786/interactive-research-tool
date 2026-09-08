"use client";

import * as React from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { SavedIndicator } from "@/components/saved-indicator";
import { useAutosave } from "@/hooks/use-autosave";
import { renameProject, deleteProject } from "@/app/projects/actions";

export function DangerZone({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [name, setName] = React.useState(projectName);
  const { status } = useAutosave(name, (v) => renameProject(projectId, v));

  const [confirmText, setConfirmText] = React.useState("");
  const [deleting, setDeleting] = React.useState(false);
  const canDelete = confirmText.trim() === projectName;

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteProject(projectId);
    } catch (err) {
      toast.error("Couldn't delete project", { description: err instanceof Error ? err.message : undefined });
      setDeleting(false);
    }
  };

  return (
    <Card className="border-danger/30">
      <CardHeader>
        <CardTitle className="text-danger">Danger zone</CardTitle>
        <CardDescription>These actions are only available to the project owner.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label>Rename project</Label>
            <SavedIndicator status={status} />
          </div>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="flex flex-col gap-2 rounded-md border border-danger/30 bg-danger/5 p-4">
          <Label>Delete this project</Label>
          <p className="text-sm text-text-secondary">
            This permanently deletes the project and its matrix, themes, and outline. Papers already in your
            personal library are not deleted. Type <strong>{projectName}</strong> to confirm.
          </p>
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={projectName}
          />
          <Button
            variant="destructive"
            disabled={!canDelete || deleting}
            onClick={handleDelete}
            className="self-start"
          >
            {deleting ? "Deleting…" : "Delete project permanently"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
