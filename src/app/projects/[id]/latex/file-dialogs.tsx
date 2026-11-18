"use client";

import * as React from "react";
import { Loader2, Upload, FolderUp, FileArchive, TriangleAlert, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { buildUploadPlan, type SelectedFile, type UploadPlan } from "@/lib/latex/upload-plan";
import { dirname, extname, formatBytes, normalizePath } from "@/lib/latex/project-files";
import type { ProjectFile } from "@/lib/latex/store";

// ───────────────────────────── New file ─────────────────────────────
export function NewFileDialog({
  open,
  onOpenChange,
  existingPaths,
  defaultDir,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingPaths: Set<string>;
  defaultDir: string;
  onCreate: (path: string) => Promise<void>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <NewFileBody existingPaths={existingPaths} defaultDir={defaultDir} onCreate={onCreate} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function NewFileBody({
  existingPaths,
  defaultDir,
  onCreate,
  onClose,
}: {
  existingPaths: Set<string>;
  defaultDir: string;
  onCreate: (path: string) => Promise<void>;
  onClose: () => void;
}) {
  const [value, setValue] = React.useState(defaultDir ? `${defaultDir}/` : "");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // A bare name like "intro" becomes intro.tex; anything with an extension is kept.
    const typed = value.trim();
    const withExt = /\.[A-Za-z0-9]+$/.test(typed) ? typed : `${typed}.tex`;
    const path = normalizePath(withExt);
    if (!path) return setError("Enter a valid file name, e.g. sections/intro.tex");
    if (existingPaths.has(path)) return setError(`${path} already exists.`);
    setBusy(true);
    try {
      await onCreate(path);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the file.");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>New file</DialogTitle>
        <DialogDescription>
          Use a path to put it in a folder, e.g. <code>sections/intro.tex</code> or <code>refs.bib</code>. Folders are created
          automatically.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-2">
        <Label htmlFor="new-file-path">File name</Label>
        <Input id="new-file-path" value={value} onChange={(e) => { setValue(e.target.value); setError(null); }} autoFocus autoComplete="off" spellCheck={false} placeholder="sections/introduction.tex" />
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={busy || !value.trim()}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Create
        </Button>
      </DialogFooter>
    </form>
  );
}

// ───────────────────────────── Rename ─────────────────────────────
export function RenameDialog({
  file,
  open,
  onOpenChange,
  existingPaths,
  onRename,
}: {
  /** Kept (not nulled) while the dialog fades out, so the content doesn't vanish mid-animation. */
  file: ProjectFile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingPaths: Set<string>;
  onRename: (file: ProjectFile, newPath: string) => Promise<void>;
}) {
  return (
    <Dialog open={open && file !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        {file && <RenameBody key={file.id} file={file} existingPaths={existingPaths} onRename={onRename} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function RenameBody({
  file,
  existingPaths,
  onRename,
  onClose,
}: {
  file: ProjectFile;
  existingPaths: Set<string>;
  onRename: (file: ProjectFile, newPath: string) => Promise<void>;
  onClose: () => void;
}) {
  const [value, setValue] = React.useState(file.path);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const path = normalizePath(value);
    if (!path) return setError("Enter a valid path.");
    if (path === file.path) return onClose();
    if (existingPaths.has(path)) return setError(`${path} already exists.`);
    setBusy(true);
    try {
      await onRename(file, path);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't rename the file.");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Rename or move</DialogTitle>
        <DialogDescription>
          Change the name, or the folder part of the path to move it. Remember to update any <code>\input</code> or{" "}
          <code>\includegraphics</code> lines that point at the old path.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-2">
        <Label htmlFor="rename-path">Path</Label>
        <Input id="rename-path" value={value} onChange={(e) => { setValue(e.target.value); setError(null); }} autoFocus autoComplete="off" spellCheck={false} />
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={busy || !value.trim()}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Rename
        </Button>
      </DialogFooter>
    </form>
  );
}

// ───────────────────────────── Delete ─────────────────────────────
export function DeleteDialog({
  file,
  open,
  isMain,
  onOpenChange,
  onDelete,
}: {
  file: ProjectFile | null;
  open: boolean;
  isMain: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: (file: ProjectFile) => Promise<void>;
}) {
  const [busy, setBusy] = React.useState(false);
  return (
    <Dialog open={open && file !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {file?.path}?</DialogTitle>
          <DialogDescription>
            This permanently removes the file for everyone on this project and can&apos;t be undone.
            {isMain && " It is the main document — you'll need to choose another."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="destructive"
            disabled={busy}
            onClick={async () => {
              if (!file) return;
              setBusy(true);
              try {
                await onDelete(file);
              } finally {
                setBusy(false);
                onOpenChange(false);
              }
            }}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────────── Upload ─────────────────────────────
export function UploadDialog({
  open,
  onOpenChange,
  existingPaths,
  defaultDir,
  initialSelection,
  onCommit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingPaths: Set<string>;
  defaultDir: string;
  /** Files dropped on the file panel — skips the picker step. */
  initialSelection: SelectedFile[] | null;
  onCommit: (plan: UploadPlan, onProgress: (done: number, total: number) => void) => Promise<void>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <UploadBody
          existingPaths={existingPaths}
          defaultDir={defaultDir}
          initialSelection={initialSelection}
          onCommit={onCommit}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

type Phase = "pick" | "planning" | "review" | "uploading";

function UploadBody({
  existingPaths,
  defaultDir,
  initialSelection,
  onCommit,
  onClose,
}: {
  existingPaths: Set<string>;
  defaultDir: string;
  initialSelection: SelectedFile[] | null;
  onCommit: (plan: UploadPlan, onProgress: (done: number, total: number) => void) => Promise<void>;
  onClose: () => void;
}) {
  const [targetDir, setTargetDir] = React.useState(defaultDir);
  const [phase, setPhase] = React.useState<Phase>(initialSelection ? "planning" : "pick");
  const [plan, setPlan] = React.useState<UploadPlan | null>(null);
  const [progress, setProgress] = React.useState({ done: 0, total: 0 });
  const [error, setError] = React.useState<string | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const startedRef = React.useRef(false);
  const filesInput = React.useRef<HTMLInputElement>(null);
  const folderInput = React.useRef<HTMLInputElement>(null);

  const commit = React.useCallback(
    async (p: UploadPlan) => {
      setPhase("uploading");
      setProgress({ done: 0, total: p.files.length });
      try {
        await onCommit(p, (done, total) => setProgress({ done, total }));
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed.");
        setPhase("review");
      }
    },
    [onCommit, onClose]
  );

  const runPlan = React.useCallback(
    async (selection: SelectedFile[], alreadyPlanning: boolean) => {
      if (!alreadyPlanning) setPhase("planning");
      setError(null);
      try {
        const p = await buildUploadPlan(selection, targetDir, existingPaths);
        if (p.files.length === 0) {
          setError(
            p.rejected.length > 0
              ? `Nothing could be uploaded: ${p.rejected[0].path} — ${p.rejected[0].reason}.`
              : "There were no files to upload (only build artefacts or hidden files)."
          );
          setPhase("pick");
          return;
        }
        // Plain, conflict-free uploads (e.g. one figure) go straight through.
        if (p.zipCount === 0 && !p.fromFolder && p.overwrites === 0 && p.rejected.length === 0) {
          await commit(p);
          return;
        }
        setPlan(p);
        setPhase("review");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't read those files.");
        setPhase("pick");
      }
    },
    [targetDir, existingPaths, commit]
  );

  React.useEffect(() => {
    if (initialSelection && !startedRef.current) {
      startedRef.current = true;
      void runPlan(initialSelection, true);
    }
  }, [initialSelection, runPlan]);

  const pickFrom = (list: FileList | null, folder: boolean) => {
    if (!list || list.length === 0) return;
    const selection: SelectedFile[] = Array.from(list).map((file) => ({
      file,
      relativePath: folder ? (file as File & { webkitRelativePath?: string }).webkitRelativePath || undefined : undefined,
    }));
    void runPlan(selection, false);
  };

  const counts = plan ? summarize(plan) : null;

  return (
    <div className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Upload to project</DialogTitle>
        <DialogDescription>
          Add figures (PNG, JPG, PDF), a <code>.bib</code> reference file, <code>.sty</code>/<code>.cls</code> files, or a whole
          project <code>.zip</code> (e.g. an Overleaf export).
        </DialogDescription>
      </DialogHeader>

      {phase === "pick" && (
        <>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              pickFrom(e.dataTransfer.files, false);
            }}
            className={`flex flex-col items-center gap-3 rounded-lg border-2 border-dashed p-6 text-center transition-colors ${dragging ? "border-primary bg-primary/5" : "border-border"}`}
          >
            <Upload className="h-6 w-6 text-text-secondary" aria-hidden />
            <p className="text-sm text-text-secondary">Drag files or a .zip here, or choose from your computer.</p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => filesInput.current?.click()}>
                <FileArchive className="h-4 w-4" /> Choose files or .zip
              </Button>
              <Button variant="outline" onClick={() => folderInput.current?.click()}>
                <FolderUp className="h-4 w-4" /> Choose folder
              </Button>
            </div>
            <input ref={filesInput} type="file" multiple className="sr-only" aria-label="Choose files to upload" onChange={(e) => { pickFrom(e.target.files, false); e.target.value = ""; }} />
            <input
              ref={folderInput}
              type="file"
              className="sr-only"
              aria-label="Choose a folder to upload"
              // Non-standard but supported by Chromium, Firefox and Safari.
              {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
              onChange={(e) => { pickFrom(e.target.files, true); e.target.value = ""; }}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="upload-dir">Upload into folder (optional)</Label>
            <Input id="upload-dir" value={targetDir} onChange={(e) => setTargetDir(e.target.value)} placeholder="project root — or e.g. figures" autoComplete="off" spellCheck={false} />
          </div>
        </>
      )}

      {phase === "planning" && (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-text-secondary" role="status">
          <Loader2 className="h-4 w-4 animate-spin" /> Reading files…
        </div>
      )}

      {phase === "review" && plan && counts && (
        <div className="grid gap-3">
          <div className="flex flex-wrap gap-2">
            <Badge variant="default">{plan.files.length - plan.overwrites} new</Badge>
            {plan.overwrites > 0 && <Badge variant="warning">{plan.overwrites} will be replaced</Badge>}
            {counts.tex > 0 && <Badge variant="secondary">{counts.tex} .tex</Badge>}
            {counts.bib > 0 && <Badge variant="secondary">{counts.bib} .bib</Badge>}
            {counts.images > 0 && <Badge variant="secondary">{counts.images} images/PDFs</Badge>}
            {counts.other > 0 && <Badge variant="secondary">{counts.other} other</Badge>}
            <Badge variant="outline">{formatBytes(counts.bytes)}</Badge>
          </div>
          {plan.detectedMain && (
            <p className="flex items-center gap-1.5 text-sm">
              <Star className="h-4 w-4 fill-warning text-warning" /> Main document will be set to <code>{plan.detectedMain}</code>
            </p>
          )}
          <ul className="max-h-48 overflow-auto rounded-md border border-border bg-surface-alt p-2 text-xs">
            {plan.files.map((f) => (
              <li key={f.path} className="flex items-center justify-between gap-2 py-0.5">
                <span className="truncate font-mono">{f.path}</span>
                <span className="shrink-0 text-text-secondary">{f.overwrites ? "replace" : formatBytes(f.bytes.length)}</span>
              </li>
            ))}
          </ul>
          {plan.skipped.length > 0 && (
            <p className="text-xs text-text-secondary">
              Skipped {plan.skipped.length} build/hidden file{plan.skipped.length === 1 ? "" : "s"} (e.g.{" "}
              {plan.skipped.slice(0, 3).map((s) => s.split("/").pop()).join(", ")}).
            </p>
          )}
          {plan.rejected.length > 0 && (
            <div className="rounded-md border border-danger/40 bg-danger/5 p-2 text-xs text-danger">
              <p className="mb-1 font-medium">Couldn&apos;t take {plan.rejected.length} file{plan.rejected.length === 1 ? "" : "s"}:</p>
              <ul className="list-inside list-disc">
                {plan.rejected.slice(0, 5).map((r) => (
                  <li key={r.path}>{r.path} — {r.reason}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {phase === "uploading" && (
        <div className="grid gap-2 py-4" role="status">
          <p className="flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Uploading {progress.done} / {progress.total}…
          </p>
          <div className="h-2 overflow-hidden rounded-full bg-surface-alt">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
          </div>
        </div>
      )}

      {error && (
        <p className="flex items-start gap-2 text-sm text-danger" role="alert">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </p>
      )}

      <DialogFooter>
        {phase !== "uploading" && (
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        )}
        {phase === "review" && plan && (
          <Button onClick={() => void commit(plan)}>
            <Upload className="h-4 w-4" /> Upload {plan.files.length} file{plan.files.length === 1 ? "" : "s"}
          </Button>
        )}
      </DialogFooter>
    </div>
  );
}

function summarize(plan: UploadPlan) {
  let tex = 0, bib = 0, images = 0, other = 0, bytes = 0;
  for (const f of plan.files) {
    bytes += f.bytes.length;
    const ext = extname(f.path);
    if (ext === "tex") tex++;
    else if (ext === "bib") bib++;
    else if (["png", "jpg", "jpeg", "gif", "webp", "svg", "pdf", "eps"].includes(ext)) images++;
    else other++;
  }
  return { tex, bib, images, other, bytes };
}

/** Folder part of a path for "upload into the folder of the file I'm viewing". */
export function folderOf(path: string | null): string {
  return path ? dirname(path) : "";
}
