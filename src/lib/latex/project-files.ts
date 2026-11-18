/**
 * Pure helpers for Overleaf-style LaTeX projects: path rules, text/binary
 * classification, zip import/export, main-file detection. No React, no
 * Supabase — so they run (and are tested) identically in Node and the browser.
 */
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";

// ───────────────────────────── limits ─────────────────────────────
export const MAX_FILE_BYTES = 25 * 1024 * 1024; // matches the Storage bucket limit
export const MAX_ZIP_BYTES = 60 * 1024 * 1024; // compressed upload
export const MAX_UNZIPPED_BYTES = 120 * 1024 * 1024; // zip-bomb guard
export const MAX_ENTRIES = 600;
export const MAX_TEXT_BYTES = 2 * 1024 * 1024; // a single .tex/.bib bigger than this is not "text we edit"

// ───────────────────────────── paths ─────────────────────────────
/**
 * Normalises a user/zip supplied path to a safe project-relative path:
 * forward slashes, no leading slash, no `.`/`..` segments, no control chars.
 * Returns null when the path is unusable (empty, escapes root, too long).
 */
export function normalizePath(input: string): string | null {
  if (typeof input !== "string") return null;
  if (/[\u0000-\u001f\u007f]/.test(input)) return null;
  const parts: string[] = [];
  for (const raw of input.replace(/\\/g, "/").split("/")) {
    const part = raw.trim();
    if (!part || part === ".") continue;
    if (part === "..") return null; // never let a path climb out of the project
    parts.push(part);
  }
  if (parts.length === 0) return null;
  const path = parts.join("/");
  if (path.length > 240 || parts.some((p) => p.length > 120)) return null;
  return path;
}

export function dirname(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

export function basename(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

export function extname(path: string): string {
  const base = basename(path);
  const i = base.lastIndexOf(".");
  return i <= 0 ? "" : base.slice(i + 1).toLowerCase();
}

/** Strips a trailing `.tex` — what `\includegraphics{...}` / `\input{...}` usually omit. */
export function stripExt(path: string): string {
  return path.replace(/\.[^./]+$/, "");
}

// ─────────────────────────── classification ───────────────────────────
const TEXT_EXTS = new Set([
  "tex", "bib", "sty", "cls", "bst", "bbx", "cbx", "def", "cfg", "clo", "ltx", "dtx", "ins",
  "txt", "md", "csv", "tsv", "dat", "json", "tikz", "pgf", "bbl", "lbx", "ist", "latexmkrc",
]);

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  eps: "application/postscript",
  ttf: "font/ttf",
  otf: "font/otf",
  woff: "font/woff",
  woff2: "font/woff2",
  tex: "application/x-tex",
  bib: "text/x-bibtex",
  txt: "text/plain",
  csv: "text/csv",
};

export function mimeFor(path: string): string {
  return MIME[extname(path)] ?? "application/octet-stream";
}

export type FileClass = "text" | "binary";

/** Known-text extension, or (for unknown ones) no NUL byte in the first 8 KB. */
export function classifyFile(path: string, bytes?: Uint8Array): FileClass {
  const ext = extname(path);
  if (TEXT_EXTS.has(ext)) return "text";
  if (ext in MIME) return "binary";
  if (!bytes) return "binary";
  const head = bytes.subarray(0, 8192);
  for (let i = 0; i < head.length; i++) if (head[i] === 0) return "binary";
  return bytes.length <= MAX_TEXT_BYTES ? "text" : "binary";
}

export type PreviewKind = "text" | "image" | "pdf" | "other";

export function previewKind(path: string, kind: FileClass): PreviewKind {
  if (kind === "text") return "text";
  const ext = extname(path);
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return "image";
  if (ext === "pdf") return "pdf";
  return "other";
}

/** Build artefacts / OS junk that should never be imported from a zip. */
const IGNORED_EXTS = new Set([
  "aux", "log", "out", "toc", "lof", "lot", "fls", "fdb_latexmk", "blg", "bcf", "nav", "snm",
  "vrb", "idx", "ilg", "ind", "glo", "gls", "glg", "acn", "acr", "alg", "xdv", "dvi", "synctex",
  "run.xml", "zip", "gz",
]);

export function isIgnoredEntry(path: string): boolean {
  const parts = path.split("/");
  if (parts.some((p) => p === "__MACOSX" || p === ".git" || p === "node_modules")) return true;
  if (parts.some((p) => p.startsWith("."))) return true; // .DS_Store, .gitignore, .latexmkrc…
  const base = parts[parts.length - 1].toLowerCase();
  if (base === "thumbs.db" || base.endsWith("~") || base.endsWith(".synctex.gz")) return true;
  if (base.endsWith(".run.xml")) return true;
  return IGNORED_EXTS.has(extname(base));
}

// ───────────────────────────── main file ─────────────────────────────
/** True when the source has an *uncommented* `\documentclass`. */
export function hasDocumentClass(source: string): boolean {
  return /^[^%\n]*\\documentclass(?:\s*\[|\s*\{)/m.test(source);
}

/** Picks the most likely root document: root-level `main.tex` first, then any root-level root doc, then the shortest path. */
export function detectMainFile(files: { path: string; content?: string }[]): string | null {
  const roots = files
    .filter((f) => extname(f.path) === "tex" && f.content !== undefined && hasDocumentClass(f.content))
    .map((f) => f.path);
  if (roots.length === 0) return null;
  const rank = (p: string) => {
    const depth = p.split("/").length - 1;
    const base = basename(p).toLowerCase();
    const named = base === "main.tex" ? 0 : ["paper.tex", "document.tex", "thesis.tex", "article.tex", "manuscript.tex"].includes(base) ? 1 : 2;
    return depth * 10 + named;
  };
  return [...roots].sort((a, b) => rank(a) - rank(b) || a.length - b.length || a.localeCompare(b))[0];
}

// ─────────────────────────────── zip ───────────────────────────────
export interface ImportedFile {
  path: string;
  bytes: Uint8Array;
}

export interface ZipImportResult {
  files: ImportedFile[];
  /** Entries we deliberately left out (build artefacts, hidden files…). */
  skipped: string[];
  /** Entries we couldn't take (too big, bad path…). */
  rejected: { path: string; reason: string }[];
  /** A single top-level folder that was removed from every path (Overleaf exports often have one). */
  strippedRoot: string | null;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** If every path sits under one shared top-level folder, removes that folder. */
export function stripCommonRoot<T extends { path: string }>(files: T[]): { files: T[]; root: string | null } {
  const tops = new Set(files.map((f) => f.path.split("/")[0]));
  if (files.length > 0 && tops.size === 1 && files.every((f) => f.path.includes("/"))) {
    const root = [...tops][0];
    return { files: files.map((f) => ({ ...f, path: f.path.slice(root.length + 1) })), root };
  }
  return { files, root: null };
}

/** Reads an uploaded .zip safely (size/entry limits checked BEFORE inflating). */
export function importZip(data: Uint8Array): ZipImportResult {
  if (data.length > MAX_ZIP_BYTES) {
    throw new Error(`That zip is ${formatBytes(data.length)} — the limit is ${formatBytes(MAX_ZIP_BYTES)}.`);
  }

  const skipped: string[] = [];
  const rejected: { path: string; reason: string }[] = [];
  let totalUnzipped = 0;
  let entryCount = 0;

  let raw: Record<string, Uint8Array>;
  try {
    raw = unzipSync(data, {
      filter: (entry) => {
        if (entry.name.endsWith("/")) return false; // directory
        entryCount++;
        if (entryCount > MAX_ENTRIES) throw new Error(`The zip has more than ${MAX_ENTRIES} files.`);
        const path = normalizePath(entry.name);
        if (!path) {
          rejected.push({ path: entry.name, reason: "unsafe or invalid path" });
          return false;
        }
        if (isIgnoredEntry(path)) {
          skipped.push(path);
          return false;
        }
        if (entry.originalSize > MAX_FILE_BYTES) {
          rejected.push({ path, reason: `larger than ${formatBytes(MAX_FILE_BYTES)}` });
          return false;
        }
        totalUnzipped += entry.originalSize;
        if (totalUnzipped > MAX_UNZIPPED_BYTES) {
          throw new Error(`The zip expands to more than ${formatBytes(MAX_UNZIPPED_BYTES)}.`);
        }
        return true;
      },
    });
  } catch (err) {
    if (err instanceof Error && /^The zip /.test(err.message)) throw err;
    throw new Error("That file isn't a valid .zip archive.");
  }

  let files: ImportedFile[] = [];
  const seen = new Set<string>();
  for (const [name, bytes] of Object.entries(raw)) {
    const path = normalizePath(name);
    if (!path || seen.has(path)) continue;
    seen.add(path);
    files.push({ path, bytes });
  }

  // Overleaf/GitHub style exports wrap everything in one folder — drop it.
  const stripped = stripCommonRoot(files);
  files = stripped.files;
  const strippedRoot = stripped.root;

  files.sort((a, b) => a.path.localeCompare(b.path));
  return { files, skipped, rejected, strippedRoot };
}

/** Zips project files (text as UTF-8, binaries as-is). */
export function exportZip(files: { path: string; data: string | Uint8Array }[]): Uint8Array {
  const tree: Record<string, Uint8Array> = {};
  for (const f of files) tree[f.path] = typeof f.data === "string" ? strToU8(f.data) : f.data;
  return zipSync(tree, { level: 6 });
}

export function decodeText(bytes: Uint8Array): string {
  return strFromU8(bytes);
}

// ───────────────────────── references / includes ─────────────────────────
/** The `\includegraphics{…}` snippet users paste into a figure environment. */
export function figureSnippet(path: string): string {
  const name = basename(stripExt(path)).replace(/[_\s]+/g, "-");
  return [
    "\\begin{figure}[htbp]",
    "  \\centering",
    `  \\includegraphics[width=0.8\\linewidth]{${path}}`,
    "  \\caption{Describe this figure.}",
    `  \\label{fig:${name}}`,
    "\\end{figure}",
  ].join("\n");
}

/** Resolves an `\input`/`\includegraphics` target against the project's file list. */
export function resolveProjectPath(target: string, paths: string[], exts: string[]): string | null {
  const wanted = normalizePath(target.replace(/^\.\//, ""));
  if (!wanted) return null;
  const set = new Set(paths);
  if (set.has(wanted)) return wanted;
  for (const ext of exts) if (set.has(`${wanted}.${ext}`)) return `${wanted}.${ext}`;
  return null;
}

/** Index of the first unescaped `%` (start of a TeX comment), or -1. */
function commentStart(line: string): number {
  for (let i = 0; i < line.length; i++) {
    if (line[i] === "\\") i++;
    else if (line[i] === "%") return i;
  }
  return -1;
}

/**
 * Inlines `\input{}` / `\include{}` recursively (cycle- and depth-safe, comment-aware)
 * so a multi-file project can be exported as one document.
 */
export function flattenTex(
  mainPath: string,
  read: (path: string) => string | undefined,
  paths: string[],
  maxDepth = 12
): { source: string; missing: string[] } {
  const missing: string[] = [];
  const visit = (path: string, stack: string[]): string => {
    const text = read(path) ?? "";
    if (stack.length >= maxDepth) return text;
    return text
      .split("\n")
      .map((line) => {
        const c = commentStart(line);
        const code = c === -1 ? line : line.slice(0, c);
        const comment = c === -1 ? "" : line.slice(c);
        const replaced = code.replace(/\\(?:input|include)\s*\{([^}]+)\}/g, (_m, target: string) => {
          const resolved = resolveProjectPath(target.trim(), paths, ["tex"]);
          if (!resolved) {
            missing.push(target.trim());
            return "";
          }
          if (stack.includes(resolved) || resolved === path) return "";
          return "\n" + visit(resolved, [...stack, path]) + "\n";
        });
        return replaced + comment;
      })
      .join("\n");
  };
  return { source: visit(mainPath, []), missing };
}
