"use client";

import * as React from "react";
import { useActionState } from "react";
import { Plus } from "lucide-react";
import { createProject, type CreateProjectResult } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";

export function NewProjectDialog() {
  const [open, setOpen] = React.useState(false);
  const [state, formAction, pending] = useActionState<CreateProjectResult, FormData>(
    createProject,
    {}
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" />
          New project
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            Start a new literature review. You can fill in the rest of the scope later.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Project name</Label>
            <Input id="name" name="name" required autoFocus placeholder="e.g. AI-Based Fresh Produce Quality Grading" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="researchQuestion">Research question (optional)</Label>
            <Textarea id="researchQuestion" name="researchQuestion" rows={3} />
          </div>
          {state?.error && <p className="text-sm text-danger">{state.error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
