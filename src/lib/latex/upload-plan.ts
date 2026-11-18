/**
 * Turns whatever the user picked (loose files, a folder, one or more .zip
 * archives) into a single reviewed plan: which project paths will be created or
 * overwritten, what was skipped and why, and which file looks like the main
 * document. Nothing is written until the caller commits the plan.
 */
import {
  MAX_FILE_BYTES,
  classifyFile,
  decodeText,
  detectMainFile,
  extname,
  formatBytes,
  importZip,
  isIgnoredEntry,
  normalizePath,
  stripCommonRoot,
  type FileClass,
} from "./project-files";

export interface SelectedFile {
  file: File;
  /** `webkitRelativePath` when picked via a folder chooser. */
  relativePath?: string;
}

export interface PlannedFile {
  path: string;
  bytes: Uint8Array;
  kind: FileClass;
  overwrites: boolean;
}

export interface UploadPlan {
  files: PlannedFile[];
  skipped: string[];
  rejected: { path: string; reason: string }[];
  zipCount: number;
  fromFolder: boolean;
  /** Only set for multi-file imports (zip/folder) that contain a root document. */
  detectedMain: string | null;
  overwrites: number;
}

const isZip = (name: string) => extname(name) === "zip";

export async function buildUploadPlan(
  selected: SelectedFile[],
  targetDir: string,
  existingPaths: Set<string>
): Promise<UploadPlan> {
  const skipped: string[] = [];
  const rejected: { path: string; reason: string }[] = [];
  let zipCount = 0;

  const prefix = (() => {
    if (!targetDir.trim()) return "";
    const n = normalizePath(targetDir);
    if (!n) throw new Error("That folder name isn't valid.");
    return n + "/";
  })();

  const fromFolder = selected.some((s) => Boolean(s.relativePath));
  let collected: { path: string; bytes: Uint8Array }[] = [];

  // 1) Loose files / folder contents
  const folderItems: { path: string; bytes: Uint8Array }[] = [];
  for (const { file, relativePath } of selected) {
    if (isZip(file.name) && !relativePath) continue; // handled below
    const raw = relativePath || file.name;
    const path = normalizePath(raw);
    if (!path) {
      rejected.push({ path: raw, reason: "invalid file name" });
      continue;
    }
    if (relativePath && isIgnoredEntry(path)) {
      skipped.push(path);
      continue;
    }
    if (file.size > MAX_FILE_BYTES) {
      rejected.push({ path, reason: `larger than ${formatBytes(MAX_FILE_BYTES)} (is ${formatBytes(file.size)})` });
      continue;
    }
    folderItems.push({ path, bytes: new Uint8Array(await file.arrayBuffer()) });
  }
  collected = fromFolder ? stripCommonRoot(folderItems).files : folderItems;

  // 2) Zip archives
  for (const { file, relativePath } of selected) {
    if (!isZip(file.name) || relativePath) continue;
    zipCount++;
    const result = importZip(new Uint8Array(await file.arrayBuffer()));
    skipped.push(...result.skipped);
    rejected.push(...result.rejected);
    collected.push(...result.files);
  }

  // 3) Apply target folder, dedupe (later entries win), classify, flag overwrites
  const byPath = new Map<string, { path: string; bytes: Uint8Array }>();
  for (const f of collected) {
    const path = prefix + f.path;
    const checked = normalizePath(path);
    if (!checked) {
      rejected.push({ path, reason: "invalid path" });
      continue;
    }
    byPath.set(checked, { path: checked, bytes: f.bytes });
  }
  const files: PlannedFile[] = [...byPath.values()]
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((f) => ({
      path: f.path,
      bytes: f.bytes,
      kind: classifyFile(f.path, f.bytes),
      overwrites: existingPaths.has(f.path),
    }));

  const multi = zipCount > 0 || fromFolder;
  const detectedMain = multi
    ? detectMainFile(files.map((f) => ({ path: f.path, content: f.kind === "text" ? decodeText(f.bytes) : undefined })))
    : null;

  return {
    files,
    skipped,
    rejected,
    zipCount,
    fromFolder,
    detectedMain,
    overwrites: files.filter((f) => f.overwrites).length,
  };
}
