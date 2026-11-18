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
  ExternalLink,
  TriangleAlert,
  Terminal,
  Database,
  Copy,
  Check,
  ChevronDown,
} from "lucide-react";
import { StreamLanguage } from "@codemirror/language";
import { stex } from "@codemirror/legacy-modes/mode/stex";
import { EditorView } from "@codemirror/view";
import type { SiglumCompiler } from "@siglum/engine";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmButton } from "@/components/confirm-button";
import { SavedIndicator } from "@/components/saved-indicator";
import { useAutosave } from "@/hooks/use-autosave";
import { downloadBlob } from "@/lib/export/csv";
import { LATEX_MIGRATION_SQL } from "@/lib/latex/migration-sql";
import { saveLatexDocument } from "./actions";

const CodeMirror = dynamic(() => import("@uiw/react-codemirror"), {
  ssr: false,
  loading: () => <Skeleton className="h-full min-h-80 w-full rounded-md" />,
});

type Engine = "pdflatex" | "xelatex";
type Phase = "idle" | "loading" | "compiling";

interface CompiledPdf {
  blob: Blob;
  url: string;
  /** The exact source this PDF was compiled from (to detect a stale preview). */
  source: string;
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "document"
  );
}

/** Turns the most common cryptic TeX failures into an actionable sentence. */
function explainTexError(rawMessage: string): string {
  // The engine always compiles a virtual "/document.tex"; show a line number instead.
  const raw = rawMessage.replace(/^\/?document\.tex:(\d+):\s*/i, "Line $1: ");
  if (/Font (?:ec|tc)[a-z]+\d+ at \d+ not found/i.test(raw)) {
    return `${raw}\n\nHint: this document uses T1-encoded Computer Modern fonts, which aren't bundled in the in-browser engine. Add \\usepackage{lmodern} right after \\usepackage[T1]{fontenc} (the generated template already does).`;
  }
  return raw;
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

export function LatexWorkspace({
  projectId,
  projectName,
  initialContent,
  template,
  hasSavedDocument,
  storageError,
}: {
  projectId: string;
  projectName: string;
  initialContent: string;
  template: string;
  hasSavedDocument: boolean;
  storageError: string | null;
}) {
  const { resolvedTheme } = useTheme();
  const [content, setContent] = React.useState(initialContent);
  const [engine, setEngine] = React.useState<Engine>("pdflatex");
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [progress, setProgress] = React.useState("");
  const [pdf, setPdf] = React.useState<CompiledPdf | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [log, setLog] = React.useState("");
  const [showLog, setShowLog] = React.useState(false);
  const [exportingDocx, setExportingDocx] = React.useState(false);

  const compilerRef = React.useRef<SiglumCompiler | null>(null);
  const compilerPromiseRef = React.useRef<Promise<SiglumCompiler> | null>(null);
  const busyRef = React.useRef(false);
  const engineLogRef = React.useRef<string[]>([]);
  const pdfUrlRef = React.useRef<string | null>(null);

  const { status: saveStatus } = useAutosave(content, (value) => saveLatexDocument(projectId, value), {
    enabled: !storageError,
  });

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
    const source = content;
    setError(null);
    setProgress("");
    try {
      setPhase("loading");
      const compiler = await ensureCompiler();
      setPhase("compiling");
      setProgress("");
      const result = await compiler.compile(source, { engine });
      setLog(result.log ?? "");
      if (result.success) {
        const blob = new Blob([result.pdf], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
        pdfUrlRef.current = url;
        setPdf({ blob, url, source });
        setShowLog(false);
      } else {
        setError(explainTexError(result.error || "LaTeX compilation failed."));
        setShowLog(true);
      }
    } catch (err) {
      setError(friendlyError(err));
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
  }, [content, engine, ensureCompiler]);

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

  const extensions = React.useMemo(() => [StreamLanguage.define(stex), EditorView.lineWrapping], []);

  // Ctrl/⌘ + Enter compiles. Handled in the capture phase on the wrapper so it
  // runs before CodeMirror's own binding for the same chord (insert blank line).
  const handleEditorKeyDownCapture = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      void compile();
    }
  };

  const filename = slugify(projectName);
  const isStale = pdf !== null && pdf.source !== content;
  const busy = phase !== "idle";

  const handleDownloadTex = () => {
    downloadBlob(`${filename}.tex`, new Blob([content], { type: "application/x-tex;charset=utf-8" }));
  };

  const handleDownloadPdf = () => {
    if (!pdf) return;
    downloadBlob(`${filename}.pdf`, pdf.blob);
    if (isStale) toast.info("Downloaded the last compiled PDF", { description: "Your latest edits aren't in it yet — compile again to update." });
  };

  const handleDownloadDocx = async () => {
    setExportingDocx(true);
    try {
      const { latexToDocxBlob } = await import("@/lib/latex/to-docx");
      const { blob, warnings } = await latexToDocxBlob(content);
      downloadBlob(`${filename}.docx`, blob);
      if (warnings.length > 0) {
        toast.info("Exported to Word with some simplifications", { description: warnings.join(" ") });
      } else {
        toast.success("Word document downloaded.");
      }
    } catch (err) {
      toast.error("Couldn't create the Word document", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setExportingDocx(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      {storageError && <StorageNotice message={storageError} />}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => void compile()} disabled={busy} title="Compile (Ctrl/⌘ + Enter)">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {phase === "loading" ? "Preparing engine…" : phase === "compiling" ? "Compiling…" : "Compile"}
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
          {!storageError && !hasSavedDocument && saveStatus === "idle" && content === template && (
            <span className="text-xs text-text-secondary">Generated from your project — edits save automatically.</span>
          )}
          {content !== template && (
            <ConfirmButton
              variant="outline"
              size="default"
              onConfirm={() => {
                setContent(template);
                toast.success("Reset to the project template.");
              }}
              armedChildren="Discard my edits?"
            >
              Reset to project template
            </ConfirmButton>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={exportingDocx}>
                {exportingDocx ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Download
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel>Export this document</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={handleDownloadTex} className="min-h-11">
                <FileCode2 className="h-4 w-4" /> LaTeX source (.tex)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={handleDownloadPdf} disabled={!pdf} className="min-h-11">
                <FileText className="h-4 w-4" /> PDF{pdf ? (isStale ? " (last compile)" : "") : " — compile first"}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void handleDownloadDocx()} className="min-h-11">
                <FileType className="h-4 w-4" /> Word document (.docx)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Editor | Preview */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="flex flex-col overflow-hidden">
          <CardHeader className="flex-row items-center justify-between space-y-0 border-b border-border py-3">
            <span className="flex items-center gap-2 font-mono text-sm text-text-secondary">
              <FileCode2 className="h-4 w-4" /> {filename}.tex
            </span>
            <span className="hidden text-xs text-text-secondary sm:inline">Ctrl/⌘ + Enter to compile</span>
          </CardHeader>
          <div className="h-[60vh] lg:h-[72vh]" onKeyDownCapture={handleEditorKeyDownCapture}>
            <CodeMirror
              value={content}
              onChange={setContent}
              extensions={extensions}
              theme={resolvedTheme === "dark" ? "dark" : "light"}
              height="100%"
              style={{ height: "100%" }}
              basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: true, autocompletion: false }}
              aria-label="LaTeX source"
            />
          </div>
        </Card>

        <Card className="flex flex-col overflow-hidden">
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
          <div className="relative h-[60vh] bg-surface-alt lg:h-[72vh]">
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
                    afterwards) and runs entirely in your browser — your draft is never uploaded.
                  </p>
                </div>
              )
            )}

            {busy && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-surface/80 p-6 text-center backdrop-blur-sm">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <p className="text-sm font-medium">
                  {phase === "loading" ? "Preparing the TeX engine…" : "Compiling your document…"}
                </p>
                {phase === "loading" && (
                  <p className="max-w-xs text-xs text-text-secondary">
                    One-time download — it&apos;s cached in your browser for next time.
                  </p>
                )}
                {progress && <p className="max-w-xs truncate text-xs text-text-secondary">{progress}</p>}
              </div>
            )}

            {error && !busy && (
              <div className="absolute inset-0 overflow-auto bg-surface p-4">
                <div className="flex items-start gap-2 text-danger">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <p className="text-sm font-medium">{error}</p>
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>

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
    </div>
  );
}

function StorageNotice({ message }: { message: string }) {
  const [copied, setCopied] = React.useState(false);
  const missingTable = /latex_documents|schema cache|does not exist/i.test(message);

  return (
    <Card className="border-warning/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Database className="h-4 w-4 text-warning" />
          {missingTable ? "One-time database setup needed to save this document" : "Couldn't load the saved document"}
        </CardTitle>
        <CardDescription>
          {missingTable
            ? "You can still edit, compile and export right now — but changes won't be saved until this table exists. Run the SQL below once in your Supabase project (SQL Editor → New query → Run), then reload."
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
