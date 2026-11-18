"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import {
  Play,
  Loader2,
  Download,
  FileCode2,
  FileText,
  FileType,
  FileArchive,
  ExternalLink,
  TriangleAlert,
  Terminal,
  Database,
  Copy,
  Check,
  ChevronDown,
  FilePlus2,
  Upload,
  FolderTree,
  MoreVertical,
  RotateCcw,
  Star,
  Info,
  Maximize2,
  Minimize2,
  PanelLeft,
  Columns2,
  Settings2,
  ShieldCheck,
  Eye,
} from "lucide-react";
import { EditorView } from "@codemirror/view";
import type { SiglumCompiler } from "@siglum/engine";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SavedIndicator } from "@/components/saved-indicator";
import type { SaveStatus } from "@/hooks/use-autosave";
import { createClient } from "@/lib/supabase/client";
import { downloadBlob } from "@/lib/export/csv";
import { LATEX_MIGRATION_SQL } from "@/lib/latex/migration-sql";
import {
  MemoryLatexStore,
  SupabaseLatexStore,
  friendlyStoreError,
  type LatexStore,
  type ProjectFile,
} from "@/lib/latex/store";
import {
  decodeText,
  detectMainFile,
  dirname,
  exportZip,
  extname,
  figureSnippet,
  flattenTex,
  basename,
  findGraphic,
  findGraphicTargets,
  parseGraphicsPaths,
} from "@/lib/latex/project-files";
import { explainTexError, extractLogWarnings, hasWarnings, type ExplainedError, type LogWarnings } from "@/lib/latex/diagnostics";
import type { SelectedFile, UploadPlan } from "@/lib/latex/upload-plan";
import { latexLanguage, bibtexLanguage } from "@/lib/latex/editor-languages";
import { DEFAULT_SETTINGS, loadSettings, saveSettings, settingsExtensions, type EditorSettings } from "@/lib/latex/editor-settings";
import { latexCompletion, type CompletionData } from "@/lib/latex/latex-completions";
import { parseBib } from "@/lib/latex/bibtex";
import { FileTree } from "./file-tree";
import { ReferencesDialog } from "./references-dialog";
import { EditorSettingsDialog } from "./editor-settings-dialog";
import { BinaryPreview } from "./binary-preview";
import { DeleteDialog, NewFileDialog, RenameDialog, UploadDialog, folderOf } from "./file-dialogs";

const CodeMirror = dynamic(() => import("@uiw/react-codemirror"), {
  ssr: false,
  loading: () => <Skeleton className="h-full min-h-80 w-full rounded-md" />,
});

type Engine = "pdflatex" | "xelatex";
type Phase = "idle" | "loading" | "compiling";

interface CompiledPdf {
  blob: Blob;
  url: string;
  /** Project revision this PDF was compiled from (to detect a stale preview). */
  rev: number;
}

const NO_WARNINGS: LogWarnings = { citations: [], references: [] };

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "document"
  );
}

function friendlyError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/failed to fetch|could not fetch|networkerror|load failed/i.test(message)) {
    return "Couldn't download the TeX engine. Check your connection and try again — it's fetched once, then cached in your browser.";
  }
  if (/secure context|crypto/i.test(message)) {
    return "The TeX engine needs a secure (HTTPS or localhost) page to verify its download.";
  }
  return message;
}

const NEW_FILE_TEMPLATES: Record<string, string> = {
  bib: "% BibTeX references. Add entries like:\n% @article{smith2020,\n%   author  = {Smith, Jane},\n%   title   = {An example},\n%   journal = {Journal of Examples},\n%   year    = {2020}\n% }\n",
};

export function LatexWorkspace({
  projectId,
  projectName,
  template,
  initialFiles,
  initialMain,
  storageError,
}: {
  projectId: string;
  projectName: string;
  /** Freshly generated main.tex from the project's outline/themes/papers. */
  template: string;
  initialFiles: ProjectFile[];
  initialMain: string | null;
  storageError: string | null;
}) {
  const { resolvedTheme } = useTheme();

  // Real persistence when the tables exist; otherwise an in-memory store so the
  // editor still works (the notice explains that nothing is being saved).
  const [store] = React.useState<LatexStore>(() => {
    if (storageError) {
      const mem = new MemoryLatexStore();
      for (const f of initialFiles) mem.seed(f);
      return mem;
    }
    return new SupabaseLatexStore(createClient(), projectId);
  });

  const [files, setFiles] = React.useState<ProjectFile[]>(initialFiles);
  const [mainPath, setMainPath] = React.useState<string | null>(initialMain);
  const [activePath, setActivePath] = React.useState<string | null>(
    () => initialMain ?? initialFiles.find((f) => extname(f.path) === "tex")?.path ?? initialFiles[0]?.path ?? null
  );
  const [rev, setRev] = React.useState(0);
  const [collapsed, setCollapsed] = React.useState<Set<string>>(() => new Set());
  const [filesOpenMobile, setFilesOpenMobile] = React.useState(false);

  const [engine, setEngine] = React.useState<Engine>("pdflatex");
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [progress, setProgress] = React.useState("");
  const [pdf, setPdf] = React.useState<CompiledPdf | null>(null);
  const [error, setError] = React.useState<ExplainedError | null>(null);
  const [warnings, setWarnings] = React.useState<LogWarnings>(NO_WARNINGS);
  const [log, setLog] = React.useState("");
  const [showLog, setShowLog] = React.useState(false);
  const [exporting, setExporting] = React.useState<null | "docx" | "zip">(null);
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>("idle");

  const [newFileOpen, setNewFileOpen] = React.useState(false);
  const [uploadOpen, setUploadOpen] = React.useState(false);
  const [uploadSelection, setUploadSelection] = React.useState<SelectedFile[] | null>(null);
  // Targets are kept after close so dialog content doesn't vanish during the fade-out.
  const [renameTarget, setRenameTarget] = React.useState<ProjectFile | null>(null);
  const [renameOpen, setRenameOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<ProjectFile | null>(null);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [resetOpen, setResetOpen] = React.useState(false);
  const [dropActive, setDropActive] = React.useState(false);

  // Layout: full-screen focus mode, which panes are visible, and editor font size.
  type ViewMode = "editor" | "split" | "pdf";
  const [fullscreen, setFullscreen] = React.useState(false);
  const [view, setView] = React.useState<ViewMode>("split");
  const [showFiles, setShowFiles] = React.useState(true);
  const [settings, setSettings] = React.useState<EditorSettings>(() =>
    typeof window === "undefined" ? DEFAULT_SETTINGS : loadSettings()
  );
  const updateSettings = (patch: Partial<EditorSettings>) =>
    setSettings((cur) => {
      const next = { ...cur, ...patch };
      saveSettings(next);
      return next;
    });
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [refsOpen, setRefsOpen] = React.useState(false);
  // Full screen is for focus: start with just the editor + PDF, and restore the file list on exit.
  const toggleFullscreen = () => {
    setShowFiles(fullscreen); // leaving → show files again; entering → hide them
    setFullscreen(!fullscreen);
  };
  // Full-screen: lock page scroll behind the overlay; Esc exits unless a dialog/menu is open.
  React.useEffect(() => {
    if (!fullscreen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector('[role="dialog"], [role="menu"], [role="listbox"]')) setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [fullscreen]);

  const compilerRef = React.useRef<SiglumCompiler | null>(null);
  const compilerPromiseRef = React.useRef<Promise<SiglumCompiler> | null>(null);
  const busyRef = React.useRef(false);
  const engineLogRef = React.useRef<string[]>([]);
  const pdfUrlRef = React.useRef<string | null>(null);
  const binCacheRef = React.useRef(new Map<string, { updatedAt: string; bytes: Uint8Array }>());
  const viewRef = React.useRef<EditorView | null>(null);
  const pendingGotoRef = React.useRef<{ path: string; line: number } | null>(null);

  // Latest-value refs so stable callbacks (compile, save flush) never read stale state.
  const filesRef = React.useRef(files);
  const revRef = React.useRef(rev);
  const mainRef = React.useRef<string | null>(null);
  const engineRef = React.useRef(engine);

  const effectiveMain = React.useMemo(() => {
    if (mainPath && files.some((f) => f.path === mainPath)) return mainPath;
    return (
      detectMainFile(files.map((f) => ({ path: f.path, content: f.kind === "text" ? f.content : undefined }))) ??
      files.find((f) => extname(f.path) === "tex")?.path ??
      null
    );
  }, [files, mainPath]);

  React.useEffect(() => {
    filesRef.current = files;
    revRef.current = rev;
    mainRef.current = effectiveMain;
    engineRef.current = engine;
  });

  const activeFile = React.useMemo(() => files.find((f) => f.path === activePath) ?? null, [files, activePath]);
  const existingPaths = React.useMemo(() => new Set(files.map((f) => f.path)), [files]);

  /** Every change that can alter the compiled output bumps the revision (stale-PDF detection). */
  const touch = React.useCallback(() => setRev((r) => r + 1), []);

  // ───────────────────────── saving (debounced, per file) ─────────────────────────
  const dirtyRef = React.useRef(new Map<string, { file: ProjectFile; content: string }>());
  const saveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushChainRef = React.useRef<Promise<void>>(Promise.resolve());

  const flushSaves = React.useCallback((): Promise<void> => {
    const run = async () => {
      const entries = [...dirtyRef.current.values()];
      dirtyRef.current.clear();
      if (entries.length === 0) return;
      setSaveStatus("saving");
      const results = await Promise.allSettled(entries.map((e) => store.saveText(e.file, e.content)));
      const failed = entries.filter((_, i) => results[i].status === "rejected");
      for (const f of failed) if (!dirtyRef.current.has(f.file.id)) dirtyRef.current.set(f.file.id, f); // keep for retry
      if (failed.length > 0) {
        setSaveStatus("error");
        const reason = results.find((r): r is PromiseRejectedResult => r.status === "rejected")?.reason;
        toast.error("Couldn't save your change", { description: friendlyStoreError(reason) });
      } else if (dirtyRef.current.size === 0) {
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus((s) => (s === "saved" ? "idle" : s)), 2000);
      }
    };
    flushChainRef.current = flushChainRef.current.then(run, run);
    return flushChainRef.current;
  }, [store]);

  const scheduleSave = React.useCallback(
    (file: ProjectFile, content: string) => {
      if (!store.persistent) return;
      dirtyRef.current.set(file.id, { file, content });
      setSaveStatus("saving");
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => void flushSaves(), 600);
    },
    [store, flushSaves]
  );

  // Don't lose the last keystrokes: flush when leaving, and warn on tab close if unsaved.
  React.useEffect(() => {
    const dirty = dirtyRef.current;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty.size > 0) {
        void flushSaves();
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (dirty.size > 0) void flushSaves();
    };
  }, [flushSaves]);

  // ───────────────────────── binary access (cached) ─────────────────────────
  const loadBinary = React.useCallback(
    async (file: ProjectFile): Promise<Uint8Array> => {
      const hit = binCacheRef.current.get(file.id);
      if (hit && hit.updatedAt === file.updatedAt) return hit.bytes;
      const bytes = await store.readBinary(file);
      binCacheRef.current.set(file.id, { updatedAt: file.updatedAt, bytes });
      return bytes;
    },
    [store]
  );

  /** Downloads many binaries with limited concurrency, reporting progress. */
  const loadBinaries = React.useCallback(
    async (list: ProjectFile[], onProgress?: (done: number, total: number) => void) => {
      const out = new Map<string, Uint8Array>();
      let next = 0;
      let done = 0;
      const worker = async () => {
        while (next < list.length) {
          const file = list[next++];
          out.set(file.path, await loadBinary(file));
          onProgress?.(++done, list.length);
        }
      };
      await Promise.all(Array.from({ length: Math.min(4, list.length) }, worker));
      return out;
    },
    [loadBinary]
  );

  // ───────────────────────── editing ─────────────────────────
  const handleEdit = React.useCallback(
    (content: string) => {
      if (!activeFile) return;
      const target = activeFile;
      setFiles((prev) => prev.map((f) => (f.id === target.id ? { ...f, content, size: content.length } : f)));
      touch();
      scheduleSave(target, content);
    },
    [activeFile, scheduleSave, touch]
  );

  const mergeFiles = React.useCallback((incoming: ProjectFile[]) => {
    setFiles((prev) => {
      const byPath = new Map(prev.map((f) => [f.path, f]));
      for (const f of incoming) byPath.set(f.path, f);
      return [...byPath.values()];
    });
    touch();
  }, [touch]);

  const handleCreate = async (path: string) => {
    const [created] = await store.upsertTexts([{ path, content: NEW_FILE_TEMPLATES[extname(path)] ?? `% ${path}\n` }]);
    mergeFiles([created]);
    setActivePath(created.path);
    if (!mainRef.current && extname(path) === "tex") await handleSetMain(created.path);
    toast.success(`Created ${path}`);
  };

  async function handleSetMain(path: string) {
    try {
      await store.setMain(path);
      setMainPath(path);
      touch();
      toast.success(`${path} is now the main document.`);
    } catch (err) {
      toast.error("Couldn't change the main document", { description: friendlyStoreError(err) });
    }
  }

  const handleRename = async (file: ProjectFile, newPath: string) => {
    await flushSaves();
    await store.rename(file, newPath);
    setFiles((prev) => prev.map((f) => (f.id === file.id ? { ...f, path: newPath } : f)));
    setActivePath((cur) => (cur === file.path ? newPath : cur));
    if (mainRef.current === file.path) {
      await store.setMain(newPath);
      setMainPath(newPath);
    }
    touch();
    toast.success(`Renamed to ${newPath}`);
  };

  const handleDelete = async (file: ProjectFile) => {
    try {
      dirtyRef.current.delete(file.id);
      await store.remove(file);
    } catch (err) {
      toast.error("Couldn't delete the file", { description: friendlyStoreError(err) });
      return;
    }
    binCacheRef.current.delete(file.id);
    const remaining = filesRef.current.filter((f) => f.id !== file.id);
    setFiles(remaining);
    touch();
    if (mainRef.current === file.path) {
      const next = detectMainFile(remaining.map((f) => ({ path: f.path, content: f.kind === "text" ? f.content : undefined })));
      try {
        await store.setMain(next);
      } catch {
        /* settings row is advisory; effectiveMain falls back to detection */
      }
      setMainPath(next);
    }
    if (activePath === file.path) {
      setActivePath(
        remaining.find((f) => f.path === mainRef.current)?.path ?? remaining.find((f) => extname(f.path) === "tex")?.path ?? remaining[0]?.path ?? null
      );
    }
    toast.success(`Deleted ${file.path}`);
  };

  // ───────────────────────── upload ─────────────────────────
  const handleCommitUpload = async (plan: UploadPlan, onProgress: (done: number, total: number) => void) => {
    const total = plan.files.length;
    let done = 0;
    const current = new Map(filesRef.current.map((f) => [f.path, f]));
    const saved: ProjectFile[] = [];
    const failures: string[] = [];

    // A path switching between text and binary: remove the old row (and object) first.
    for (const pf of plan.files) {
      const prev = current.get(pf.path);
      if (prev && prev.kind !== pf.kind) {
        await store.remove(prev);
        binCacheRef.current.delete(prev.id);
        current.delete(pf.path);
      }
    }

    const texts = plan.files.filter((f) => f.kind === "text");
    const binaries = plan.files.filter((f) => f.kind === "binary");

    if (texts.length > 0) {
      try {
        saved.push(...(await store.upsertTexts(texts.map((f) => ({ path: f.path, content: decodeText(f.bytes) })))));
      } catch (err) {
        failures.push(`text files (${friendlyStoreError(err)})`);
      }
      done += texts.length;
      onProgress(done, total);
    }

    let next = 0;
    const worker = async () => {
      while (next < binaries.length) {
        const pf = binaries[next++];
        try {
          const file = await store.uploadBinary(pf.path, pf.bytes, current.get(pf.path));
          binCacheRef.current.set(file.id, { updatedAt: file.updatedAt, bytes: pf.bytes });
          saved.push(file);
        } catch (err) {
          failures.push(`${pf.path} (${friendlyStoreError(err)})`);
        }
        onProgress(++done, total);
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, binaries.length) }, worker));

    // Reflect what did get saved, even on partial failure. Removed kind-switched rows first.
    setFiles((prev) => {
      const gone = new Set(plan.files.filter((pf) => prev.some((f) => f.path === pf.path && f.kind !== pf.kind)).map((pf) => pf.path));
      const byPath = new Map(prev.filter((f) => !gone.has(f.path)).map((f) => [f.path, f]));
      for (const f of saved) byPath.set(f.path, f);
      return [...byPath.values()];
    });
    touch();

    if (plan.detectedMain && saved.some((f) => f.path === plan.detectedMain)) {
      try {
        await store.setMain(plan.detectedMain);
        setMainPath(plan.detectedMain);
        setActivePath(plan.detectedMain);
      } catch {
        /* non-fatal */
      }
    } else if (!mainRef.current) {
      const firstTex = saved.find((f) => extname(f.path) === "tex");
      if (firstTex) {
        await store.setMain(firstTex.path).catch(() => undefined);
        setMainPath(firstTex.path);
      }
    }

    if (failures.length > 0) {
      throw new Error(`Uploaded ${saved.length} of ${total}. Failed: ${failures.slice(0, 3).join("; ")}${failures.length > 3 ? "…" : ""}`);
    }
    const replaced = plan.overwrites > 0 ? ` (replaced ${plan.overwrites})` : "";
    toast.success(`Uploaded ${saved.length} file${saved.length === 1 ? "" : "s"}${replaced}`, {
      description: plan.detectedMain ? `Main document: ${plan.detectedMain}` : undefined,
    });
  };

  const openUpload = (selection: SelectedFile[] | null = null) => {
    setUploadSelection(selection);
    setUploadOpen(true);
  };

  // ───────────────────────── compile ─────────────────────────
  const ensureCompiler = React.useCallback(async (): Promise<SiglumCompiler> => {
    if (compilerRef.current) return compilerRef.current;
    if (!compilerPromiseRef.current) {
      compilerPromiseRef.current = (async () => {
        // Loaded on demand: the engine is only needed once someone compiles.
        const { SiglumCompiler: Compiler, resolveRuntime } = await import("@siglum/engine");
        const base = process.env.NEXT_PUBLIC_LATEX_RUNTIME_URL;
        const runtime = await resolveRuntime(base ? { baseUrl: base } : undefined);
        const compiler = new Compiler({
          ...runtime,
          // Served from /public by scripts/copy-siglum-worker.mjs (version-matched).
          workerUrl: "/siglum/worker.js",
          // The engine's document cache is keyed by a 32-bit fallback hash (see
          // src/lib/latex/blake3-disabled.ts). A collision would show a stale PDF
          // for a different document, so recompile every time instead.
          enableDocCache: false,
          onLog: (msg) => {
            const buffer = engineLogRef.current;
            buffer.push(msg);
            if (buffer.length > 600) buffer.splice(0, buffer.length - 600);
            if (process.env.NODE_ENV !== "production") console.debug("[siglum]", msg);
          },
          onProgress: (stage, detail) => setProgress(detail ? `${stage} — ${detail}` : stage),
        });
        await compiler.init();
        compilerRef.current = compiler;
        return compiler;
      })().catch((err) => {
        compilerPromiseRef.current = null; // allow a retry after a failed download
        throw err;
      });
    }
    return compilerPromiseRef.current;
  }, []);

  const compile = React.useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    const snapshot = filesRef.current;
    const main = mainRef.current;
    const startRev = revRef.current;
    setError(null);
    setWarnings(NO_WARNINGS);
    setProgress("");
    try {
      const mainFile = main ? snapshot.find((f) => f.path === main) : undefined;
      if (!main || !mainFile || mainFile.kind !== "text") {
        throw new Error("There's no main document yet. Add a .tex file and set it as the main document (⋮ menu → Set as main document).");
      }

      setPhase("loading");
      const binaries = snapshot.filter((f) => f.kind === "binary");
      const [compiler, binaryData] = await Promise.all([
        ensureCompiler(),
        loadBinaries(binaries, (done, total) => setProgress(`Fetching figures and assets (${done}/${total})`)),
      ]);

      const additionalFiles: Record<string, string | Uint8Array> = {};
      for (const f of snapshot) {
        if (f.path === main) continue;
        if (f.kind === "text") additionalFiles[f.path] = f.content;
        else additionalFiles[f.path] = binaryData.get(f.path) as Uint8Array;
      }

      setPhase("compiling");
      setProgress("");
      const result = await compiler.compile(mainFile.content, { engine: engineRef.current, mainFile: main, additionalFiles });
      const resultLog = result.log ?? "";
      setLog(resultLog);
      setWarnings(extractLogWarnings(resultLog));
      if (result.success) {
        const blob = new Blob([result.pdf], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
        pdfUrlRef.current = url;
        setPdf({ blob, url, rev: startRev });
        setShowLog(false);
      } else {
        setError(explainTexError(result.error || "LaTeX compilation failed.", resultLog));
        setShowLog(true);
      }
    } catch (err) {
      setError({ message: friendlyError(err), file: null, line: null });
      const captured = engineLogRef.current.join("\n");
      if (captured) {
        setLog(captured);
        setShowLog(true);
      }
    } finally {
      busyRef.current = false;
      setPhase("idle");
      setProgress("");
    }
  }, [ensureCompiler, loadBinaries]);

  // Release the worker and the PDF object URL when leaving the page.
  React.useEffect(() => {
    return () => {
      compilerRef.current?.terminate();
      compilerRef.current = null;
      compilerPromiseRef.current = null;
      if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
      pdfUrlRef.current = null;
    };
  }, []);

  // ───────────────────────── editor plumbing ─────────────────────────
  const activeExt = activeFile ? extname(activeFile.path) : "";
  const langKind = ["tex", "sty", "cls", "def", "cfg", "ltx", "tikz", "bbl"].includes(activeExt) ? "tex" : activeExt === "bib" ? "bib" : "plain";
  const appIsDark = resolvedTheme === "dark";

  // Autocomplete reads live project data through a ref, so the extension itself stays stable.
  const completionDataRef = React.useRef<CompletionData>({ bib: [], labels: [], images: [], texFiles: [], bibFiles: [] });
  const completionData = React.useMemo<CompletionData>(() => {
    const text = files.filter((f) => f.kind === "text");
    const bib = text
      .filter((f) => extname(f.path) === "bib")
      .flatMap((f) => [...parseBib(f.content).values()])
      .map((e) => ({
        key: e.key,
        title: e.fields.title?.replace(/[{}]/g, ""),
        year: e.fields.year,
        author: e.fields.author?.split(/\s+and\s+/i)[0]?.split(",")[0]?.replace(/[{}]/g, "").trim(),
      }));
    const labels = [...new Set(text.filter((f) => extname(f.path) === "tex").flatMap((f) => [...f.content.matchAll(/\\label\{([^}]+)\}/g)].map((m) => m[1])))];
    return {
      bib,
      labels,
      images: files.filter((f) => f.kind === "binary" && ["png", "jpg", "jpeg", "pdf", "eps"].includes(extname(f.path))).map((f) => f.path),
      texFiles: text.filter((f) => extname(f.path) === "tex").map((f) => f.path),
      bibFiles: text.filter((f) => extname(f.path) === "bib").map((f) => f.path),
    };
  }, [files]);
  React.useEffect(() => {
    completionDataRef.current = completionData;
  });
  const completion = React.useMemo(() => latexCompletion(() => completionDataRef.current), []);

  const extensions = React.useMemo(
    () => [
      ...(langKind === "tex" ? [latexLanguage] : langKind === "bib" ? [bibtexLanguage] : []),
      ...settingsExtensions(settings, appIsDark),
      ...(settings.autocomplete && langKind === "tex" ? [completion] : []),
    ],
    [langKind, settings, appIsDark, completion]
  );

  // Optional auto-compile: ~2.5 s after the last change.
  React.useEffect(() => {
    if (!settings.autoCompile || rev === 0) return;
    const t = setTimeout(() => void compile(), 2500);
    return () => clearTimeout(t);
  }, [rev, settings.autoCompile, compile]);

  /** Replaces a text file's content from outside the editor (e.g. a reference fix). */
  const applyExternalEdit = (path: string, content: string) => {
    const target = filesRef.current.find((f) => f.path === path);
    if (!target) return;
    setFiles((prev) => prev.map((f) => (f.id === target.id ? { ...f, content, size: content.length } : f)));
    touch();
    scheduleSave(target, content);
  };

  const applyGoto = (view: EditorView, path: string) => {
    const goto = pendingGotoRef.current;
    if (!goto || goto.path !== path) return;
    pendingGotoRef.current = null;
    const line = Math.min(Math.max(1, goto.line), view.state.doc.lines);
    const pos = view.state.doc.line(line).from;
    view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: "center" }) });
    view.focus();
  };

  const goTo = (path: string, line: number) => {
    pendingGotoRef.current = { path, line };
    if (path === activePath && viewRef.current) applyGoto(viewRef.current, path);
    else setActivePath(path);
  };

  // Ctrl/⌘ + Enter compiles. Handled in the capture phase on the wrapper so it
  // runs before CodeMirror's own binding for the same chord (insert blank line).
  const handleEditorKeyDownCapture = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      void compile();
    }
  };

  // ───────────────────────── downloads ─────────────────────────
  const filename = slugify(projectName);
  const isStale = pdf !== null && pdf.rev !== rev;
  const busy = phase !== "idle";

  const downloadOne = async (file: ProjectFile) => {
    try {
      const blob =
        file.kind === "text"
          ? new Blob([file.content], { type: "text/plain;charset=utf-8" })
          : new Blob([(await loadBinary(file)) as BlobPart], { type: file.mime });
      downloadBlob(basename(file.path), blob);
    } catch (err) {
      toast.error("Couldn't download the file", { description: friendlyStoreError(err) });
    }
  };

  const handleDownloadPdf = () => {
    if (!pdf) return;
    downloadBlob(`${filename}.pdf`, pdf.blob);
    if (isStale) toast.info("Downloaded the last compiled PDF", { description: "Your latest edits aren't in it yet — compile again to update." });
  };

  const handleDownloadZip = async () => {
    setExporting("zip");
    try {
      const snapshot = filesRef.current;
      const binaryData = await loadBinaries(snapshot.filter((f) => f.kind === "binary"));
      const bytes = exportZip(
        snapshot.map((f) => ({ path: f.path, data: f.kind === "text" ? f.content : (binaryData.get(f.path) as Uint8Array) }))
      );
      downloadBlob(`${filename}.zip`, new Blob([bytes as BlobPart], { type: "application/zip" }));
      toast.success(`Downloaded ${snapshot.length} files as a zip — re-uploadable to Overleaf.`);
    } catch (err) {
      toast.error("Couldn't create the zip", { description: friendlyStoreError(err) });
    } finally {
      setExporting(null);
    }
  };

  const handleDownloadDocx = async () => {
    setExporting("docx");
    try {
      const snapshot = filesRef.current;
      const main = mainRef.current;
      const mainFile = snapshot.find((f) => f.path === main);
      if (!main || !mainFile) throw new Error("There's no main document to export.");
      const paths = snapshot.map((f) => f.path);
      const { source, missing } = flattenTex(main, (p) => snapshot.find((f) => f.path === p)?.content, paths);

      const { latexToDocxBlob } = await import("@/lib/latex/to-docx");
      // Only fetch the figures the document actually uses. PNG/JPG go in as-is; PDF figures
      // are rasterised in the browser (Word can't embed PDF).
      const binaryByPath = new Map(snapshot.filter((f) => f.kind === "binary").map((f) => [f.path, f]));
      const binaryPaths = [...binaryByPath.keys()];
      const graphicsPaths = parseGraphicsPaths(source);
      const used = new Set<string>();
      for (const target of findGraphicTargets(source)) {
        const hit = findGraphic(target, binaryPaths, graphicsPaths);
        if (hit) used.add(hit);
      }
      const rawData = await loadBinaries([...used].map((p) => binaryByPath.get(p)!));
      const imageData = new Map<string, Uint8Array>();
      const { renderPdfToPng } = await import("@/lib/latex/figure-convert");
      for (const [path, bytes] of rawData) {
        const ext = extname(path);
        if (ext === "png" || ext === "jpg" || ext === "jpeg") imageData.set(path, bytes);
        else if (ext === "pdf") {
          try {
            imageData.set(path, await renderPdfToPng(bytes));
          } catch (err) {
            console.warn(`Couldn't render ${path}`, err);
          }
        }
      }
      const bibText = snapshot
        .filter((f) => f.kind === "text" && extname(f.path) === "bib")
        .map((f) => f.content)
        .join("\n\n");
      const { blob, warnings: notes } = await latexToDocxBlob(source, { images: imageData, bibliography: bibText || undefined, projectPaths: paths });
      downloadBlob(`${filename}.docx`, blob);
      const all = [...notes, ...(missing.length ? [`Couldn't find included file(s): ${missing.join(", ")}.`] : [])];
      if (all.length > 0) toast.info("Exported to Word with some simplifications", { description: all.join(" ") });
      else toast.success("Word document downloaded.");
    } catch (err) {
      toast.error("Couldn't create the Word document", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setExporting(null);
    }
  };

  const copySnippet = async (file: ProjectFile) => {
    try {
      await navigator.clipboard.writeText(figureSnippet(file.path));
      toast.success("Figure snippet copied — paste it into your .tex file.");
    } catch {
      toast.error("Couldn't access the clipboard.");
    }
  };

  const toggleDir = (path: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const handleReset = async () => {
    try {
      const [file] = await store.upsertTexts([{ path: "main.tex", content: template }]);
      dirtyRef.current.delete(file.id);
      mergeFiles([file]);
      await store.setMain("main.tex");
      setMainPath("main.tex");
      setActivePath("main.tex");
      toast.success("main.tex regenerated from your project data.");
    } catch (err) {
      toast.error("Couldn't regenerate main.tex", { description: friendlyStoreError(err) });
    }
  };

  const uploadDir = folderOf(activeFile?.path ?? null);
  const fileCount = files.length;
  const hasBinaries = files.some((f) => f.kind === "binary");

  const paneH = fullscreen ? "h-[calc(100dvh-7rem)]" : "h-[60vh] lg:h-[72vh]";
  const filesH = fullscreen ? "lg:h-[calc(100dvh-12.5rem)]" : "lg:h-[calc(72vh-5.5rem)]";
  const single = view !== "split";
  const gridCols = showFiles
    ? single
      ? "lg:grid-cols-[230px_minmax(0,1fr)]"
      : "lg:grid-cols-[230px_minmax(0,1fr)_minmax(0,1fr)]"
    : single
      ? "lg:grid-cols-1"
      : "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]";

  return (
    <div
      className={
        fullscreen
          ? "fixed inset-0 z-40 flex flex-col gap-3 overflow-auto bg-background p-3"
          : "flex flex-col gap-4 p-4 sm:p-6"
      }
    >
      {storageError && !fullscreen && <StorageNotice message={storageError} />}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => void compile()} disabled={busy} title="Compile (Ctrl/⌘ + Enter)">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {phase === "loading" ? "Preparing…" : phase === "compiling" ? "Compiling…" : "Compile"}
        </Button>

        <Select value={engine} onValueChange={(v) => setEngine(v as Engine)} disabled={busy}>
          <SelectTrigger className="w-44" aria-label="LaTeX engine">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pdflatex">pdfLaTeX (fast)</SelectItem>
            <SelectItem value="xelatex">XeLaTeX (Unicode)</SelectItem>
          </SelectContent>
        </Select>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <SavedIndicator status={saveStatus} />

          {/* One compact View menu instead of a row of icons */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" aria-label="View options">
                <Columns2 className="h-4 w-4" /> View <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel>Panels</DropdownMenuLabel>
              <DropdownMenuItem className="min-h-11" onSelect={() => setShowFiles((v) => !v)}>
                <PanelLeft className="h-4 w-4" /> File list {showFiles && <Check className="ml-auto h-4 w-4" />}
              </DropdownMenuItem>
              <DropdownMenuItem className="min-h-11" onSelect={() => setView("editor")}>
                <FileCode2 className="h-4 w-4" /> Editor only {view === "editor" && <Check className="ml-auto h-4 w-4" />}
              </DropdownMenuItem>
              <DropdownMenuItem className="min-h-11" onSelect={() => setView("split")}>
                <Columns2 className="h-4 w-4" /> Editor + PDF {view === "split" && <Check className="ml-auto h-4 w-4" />}
              </DropdownMenuItem>
              <DropdownMenuItem className="min-h-11" onSelect={() => setView("pdf")}>
                <Eye className="h-4 w-4" /> PDF only {view === "pdf" && <Check className="ml-auto h-4 w-4" />}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="min-h-11" onSelect={() => setSettingsOpen(true)}>
                <Settings2 className="h-4 w-4" /> Editor settings…
              </DropdownMenuItem>
              <DropdownMenuItem className="min-h-11" onSelect={() => setRefsOpen(true)}>
                <ShieldCheck className="h-4 w-4" /> Check references…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant={fullscreen ? "default" : "outline"}
            onClick={toggleFullscreen}
            aria-pressed={fullscreen}
            title={fullscreen ? "Exit full screen (Esc)" : "Full-screen editor"}
          >
            {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            {fullscreen ? "Exit full screen" : "Full screen"}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={exporting !== null}>
                {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Download
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>Export</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={handleDownloadPdf} disabled={!pdf} className="min-h-11">
                <FileText className="h-4 w-4" /> PDF{pdf ? (isStale ? " (last compile)" : "") : " — compile first"}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void handleDownloadZip()} className="min-h-11">
                <FileArchive className="h-4 w-4" /> Whole project (.zip)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void handleDownloadDocx()} className="min-h-11">
                <FileType className="h-4 w-4" /> Word document (.docx)
              </DropdownMenuItem>
              {activeFile && (
                <DropdownMenuItem onSelect={() => void downloadOne(activeFile)} className="min-h-11">
                  <FileCode2 className="h-4 w-4" /> This file ({basename(activeFile.path)})
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Files | Editor | Preview */}
      <div className={`grid grid-cols-1 gap-4 ${gridCols}`}>
        {/* File tree */}
        <Card
          className={`flex-col overflow-hidden transition-colors ${showFiles ? "flex" : "hidden"} ${dropActive ? "border-primary bg-primary/5" : ""}`}
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes("Files")) return;
            e.preventDefault();
            setDropActive(true);
          }}
          onDragLeave={() => setDropActive(false)}
          onDrop={(e) => {
            if (e.dataTransfer.files.length === 0) return;
            e.preventDefault();
            setDropActive(false);
            openUpload(Array.from(e.dataTransfer.files).map((file) => ({ file })));
          }}
        >
          <CardHeader className="flex-row items-center justify-between gap-1 space-y-0 border-b border-border py-2 pr-2">
            <button
              type="button"
              onClick={() => setFilesOpenMobile((v) => !v)}
              className="flex min-h-11 items-center gap-2 text-sm font-medium lg:pointer-events-none lg:min-h-0"
              aria-expanded={filesOpenMobile}
              aria-controls="latex-file-panel"
            >
              <FolderTree className="h-4 w-4 text-text-secondary" /> Files
              <span className="text-xs font-normal text-text-secondary">({fileCount})</span>
              <ChevronDown className={`h-4 w-4 text-text-secondary transition-transform lg:hidden ${filesOpenMobile ? "rotate-180" : ""}`} />
            </button>
            <div className="flex items-center">
              <Button size="icon" variant="ghost" className="h-11 w-11 lg:h-9 lg:w-9" aria-label="New file" title="New file" onClick={() => setNewFileOpen(true)}>
                <FilePlus2 className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-11 w-11 lg:h-9 lg:w-9" aria-label="Upload files or zip" title="Upload files, folder or .zip" onClick={() => openUpload()}>
                <Upload className="h-4 w-4" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="ghost" className="h-11 w-11 lg:h-9 lg:w-9" aria-label="More file actions" title="More">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuItem className="min-h-11" onSelect={() => setResetOpen(true)}>
                    <RotateCcw className="h-4 w-4" /> Regenerate main.tex from project
                  </DropdownMenuItem>
                  <DropdownMenuItem className="min-h-11" onSelect={() => setRefsOpen(true)}>
                    <ShieldCheck className="h-4 w-4" /> Check references
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </CardHeader>
          <div id="latex-file-panel" className={`${filesOpenMobile ? "block" : "hidden"} max-h-72 overflow-auto lg:block lg:max-h-none ${filesH}`}>
            {files.length === 0 ? (
              <div className="flex flex-col items-center gap-2 p-6 text-center text-sm text-text-secondary">
                <p>No files yet.</p>
                <Button size="sm" onClick={() => setNewFileOpen(true)}>
                  <FilePlus2 className="h-4 w-4" /> New file
                </Button>
              </div>
            ) : (
              <FileTree
                files={files}
                activePath={activePath}
                mainPath={effectiveMain}
                collapsed={collapsed}
                onToggleDir={toggleDir}
                onOpen={(p) => {
                  setActivePath(p);
                  setFilesOpenMobile(false);
                }}
                onSetMain={(p) => void handleSetMain(p)}
                onRename={(f) => {
                  setRenameTarget(f);
                  setRenameOpen(true);
                }}
                onDelete={(f) => {
                  setDeleteTarget(f);
                  setDeleteOpen(true);
                }}
                onDownload={(f) => void downloadOne(f)}
                onCopySnippet={(f) => void copySnippet(f)}
              />
            )}
          </div>
          <div className="hidden border-t border-border px-3 py-2 text-xs text-text-secondary lg:block">
            <span className="flex items-center gap-1.5">
              <Star className="h-3 w-3 fill-warning text-warning" /> Main: <code className="truncate">{effectiveMain ?? "none"}</code>
            </span>
          </div>
        </Card>

        {/* Editor / viewer */}
        <Card className={`flex-col overflow-hidden ${view === "pdf" ? "hidden" : "flex"}`}>
          <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 border-b border-border py-3">
            <span className="flex min-w-0 items-center gap-2 font-mono text-sm text-text-secondary">
              <FileCode2 className="h-4 w-4 shrink-0" />
              <span className="truncate">{activeFile?.path ?? "No file selected"}</span>
              {activeFile && activeFile.path === effectiveMain && <Badge variant="warning">main</Badge>}
            </span>
            {activeExt === "bib" ? (
              <Button size="sm" variant="outline" onClick={() => setRefsOpen(true)}>
                <ShieldCheck className="h-3.5 w-3.5" /> Check references
              </Button>
            ) : (
              <span className="hidden shrink-0 text-xs text-text-secondary sm:inline">
                {activeFile?.kind === "text" ? "Ctrl/⌘ + Enter to compile" : ""}
              </span>
            )}
          </CardHeader>
          <div className={paneH} onKeyDownCapture={handleEditorKeyDownCapture}>
            {activeFile?.kind === "text" ? (
              <CodeMirror
                key={activeFile.id}
                value={activeFile.content}
                onChange={handleEdit}
                onCreateEditor={(view) => {
                  viewRef.current = view;
                  applyGoto(view, activeFile.path);
                }}
                extensions={extensions}
                theme="none"
                height="100%"
                style={{ height: "100%" }}
                basicSetup={{
                  lineNumbers: settings.lineNumbers,
                  foldGutter: false,
                  highlightActiveLine: settings.activeLine,
                  highlightActiveLineGutter: settings.activeLine,
                  closeBrackets: settings.closeBrackets,
                  bracketMatching: true,
                  autocompletion: false,
                  tabSize: settings.tabSize,
                }}
                aria-label={`Editing ${activeFile.path}`}
              />
            ) : activeFile ? (
              <BinaryPreview
                key={`${activeFile.id}:${activeFile.updatedAt}`}
                file={activeFile}
                load={loadBinary}
                onDownload={(f) => void downloadOne(f)}
                onCopySnippet={(f) => void copySnippet(f)}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-text-secondary">
                <p>Select a file, or create one to get started.</p>
              </div>
            )}
          </div>
        </Card>

        {/* PDF preview */}
        <Card className={`flex-col overflow-hidden ${view === "editor" ? "hidden" : "flex"}`}>
          <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 border-b border-border py-3">
            <span className="flex items-center gap-2 text-sm text-text-secondary">
              <FileText className="h-4 w-4" /> PDF preview
            </span>
            <div className="flex items-center gap-2">
              {isStale && !busy && <Badge variant="warning">Out of date — compile to refresh</Badge>}
              {pdf && (
                <a
                  href={pdf.url}
                  target="_blank"
                  rel="noopener"
                  className="touch-target inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Open in new tab
                </a>
              )}
            </div>
          </CardHeader>
          <div className={`relative bg-surface-alt ${paneH}`}>
            {pdf ? (
              <iframe src={pdf.url} title="Compiled PDF preview" className="h-full w-full" />
            ) : (
              !error &&
              !busy && (
                <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <FileText className="h-5 w-5" />
                  </div>
                  <p className="max-w-xs text-sm text-text-secondary">
                    Press <strong>Compile</strong> to render your PDF. The first compile downloads the TeX engine (cached
                    afterwards) and runs entirely in your browser — your draft is never uploaded to a compile server.
                  </p>
                </div>
              )
            )}

            {busy && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-surface/80 p-6 text-center backdrop-blur-sm">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <p className="text-sm font-medium">
                  {phase === "loading" ? "Preparing the TeX engine and your files…" : "Compiling your project…"}
                </p>
                {phase === "loading" && (
                  <p className="max-w-xs text-xs text-text-secondary">
                    One-time engine download — it&apos;s cached in your browser for next time.
                  </p>
                )}
                {progress && <p className="max-w-xs truncate text-xs text-text-secondary">{progress}</p>}
              </div>
            )}

            {error && !busy && (
              <div className="absolute inset-0 overflow-auto bg-surface p-4">
                <div className="flex items-start gap-2 text-danger">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <p className="whitespace-pre-wrap text-sm font-medium">{error.message}</p>
                </div>
                {error.file && error.line && files.some((f) => f.path === error.file) && (
                  <Button size="sm" variant="outline" className="mt-3" onClick={() => goTo(error.file as string, error.line as number)}>
                    Go to {error.file}:{error.line}
                  </Button>
                )}
              </div>
            )}
          </div>

          {!busy && !error && pdf && hasWarnings(warnings) && (
            <div className="border-t border-border bg-warning/10 px-4 py-2 text-xs" role="status">
              <p className="flex items-start gap-1.5">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                <span>
                  {warnings.citations.length > 0 && (
                    <>
                      <strong>{warnings.citations.length} undefined citation{warnings.citations.length === 1 ? "" : "s"}</strong>{" "}
                      ({warnings.citations.slice(0, 5).join(", ")}
                      {warnings.citations.length > 5 ? "…" : ""}) — check the key exists in your <code>.bib</code> and that{" "}
                      <code>\bibliography{"{…}"}</code> names that file.{" "}
                      <button type="button" className="font-medium text-primary underline-offset-2 hover:underline" onClick={() => setRefsOpen(true)}>
                        Check references
                      </button>{" "}
                    </>
                  )}
                  {warnings.references.length > 0 && (
                    <>
                      <strong>{warnings.references.length} undefined reference{warnings.references.length === 1 ? "" : "s"}</strong>{" "}
                      ({warnings.references.slice(0, 5).join(", ")}
                      {warnings.references.length > 5 ? "…" : ""}) — check your <code>\label</code>s.
                    </>
                  )}
                </span>
              </p>
            </div>
          )}
        </Card>
      </div>

      {!hasBinaries && !storageError && files.length <= 2 && (
        <p className="flex items-center gap-2 text-xs text-text-secondary">
          <Upload className="h-3.5 w-3.5" /> Need figures or references? Use the upload button (↑) in the file panel — add images,
          a <code>.bib</code> file, or a whole project <code>.zip</code>.
        </p>
      )}

      {/* TeX log */}
      {log && (
        <Card>
          <button
            type="button"
            onClick={() => setShowLog((v) => !v)}
            className="flex min-h-11 w-full items-center justify-between px-5 py-3 text-left text-sm font-medium"
            aria-expanded={showLog}
          >
            <span className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-text-secondary" /> TeX log
              {error && <Badge variant="danger">errors</Badge>}
              {!error && hasWarnings(warnings) && <Badge variant="warning">warnings</Badge>}
            </span>
            <ChevronDown className={`h-4 w-4 transition-transform ${showLog ? "rotate-180" : ""}`} />
          </button>
          {showLog && (
            <CardContent>
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md bg-surface-alt p-3 font-mono text-xs">
                {log.slice(-12000)}
              </pre>
            </CardContent>
          )}
        </Card>
      )}

      {/* Dialogs */}
      <NewFileDialog
        open={newFileOpen}
        onOpenChange={setNewFileOpen}
        existingPaths={existingPaths}
        defaultDir={dirname(activeFile?.path ?? "")}
        onCreate={handleCreate}
      />
      <UploadDialog
        open={uploadOpen}
        onOpenChange={(o) => {
          setUploadOpen(o);
          if (!o) setUploadSelection(null);
        }}
        existingPaths={existingPaths}
        defaultDir={uploadDir}
        initialSelection={uploadSelection}
        onCommit={handleCommitUpload}
      />
      <RenameDialog
        file={renameTarget}
        open={renameOpen}
        onOpenChange={setRenameOpen}
        existingPaths={existingPaths}
        onRename={handleRename}
      />
      <DeleteDialog
        file={deleteTarget}
        open={deleteOpen}
        isMain={deleteTarget?.path === effectiveMain}
        onOpenChange={setDeleteOpen}
        onDelete={handleDelete}
      />
      <ReferencesDialog
        open={refsOpen}
        onOpenChange={setRefsOpen}
        files={files}
        onApplyFix={applyExternalEdit}
        onOpenEntry={(path, line) => goTo(path, line)}
      />
      <EditorSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
        onChange={updateSettings}
        appIsDark={appIsDark}
      />
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Regenerate main.tex?</DialogTitle>
            <DialogDescription>
              This replaces <code>main.tex</code> with a fresh draft built from your project&apos;s outline, themes and kept papers,
              and makes it the main document. Your other files (figures, <code>.bib</code>, sections) are not touched, but any edits
              you made to <code>main.tex</code> will be lost.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setResetOpen(false);
                void handleReset();
              }}
            >
              Replace main.tex
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StorageNotice({ message }: { message: string }) {
  const [copied, setCopied] = React.useState(false);
  const missingTable = /latex_files|latex_settings|schema cache|does not exist/i.test(message);

  return (
    <Card className="border-warning/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Database className="h-4 w-4 text-warning" />
          {missingTable ? "One-time database setup needed to save files and uploads" : "Couldn't load the project files"}
        </CardTitle>
        <CardDescription>
          {missingTable
            ? "You can still edit, compile and export right now — but changes and uploads won't be saved until these tables and the file-storage bucket exist. Run the SQL below once in your Supabase project (SQL Editor → New query → Run), then reload."
            : message}
        </CardDescription>
      </CardHeader>
      {missingTable && (
        <CardContent className="flex flex-col gap-3">
          <pre className="max-h-56 overflow-auto rounded-md bg-surface-alt p-3 font-mono text-xs">{LATEX_MIGRATION_SQL}</pre>
          <Button
            variant="outline"
            className="self-start"
            onClick={async () => {
              await navigator.clipboard.writeText(LATEX_MIGRATION_SQL);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy SQL"}
          </Button>
        </CardContent>
      )}
    </Card>
  );
}
