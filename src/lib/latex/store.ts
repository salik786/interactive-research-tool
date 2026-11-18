/**
 * Persistence for a LaTeX project's files. Two implementations behind one
 * interface:
 *  - SupabaseLatexStore: text files in `latex_files`, binaries (images, PDFs,
 *    fonts) in the private `latex-assets` Storage bucket, all through the
 *    signed-in user's client so Row-Level-Security applies. Binary uploads go
 *    straight from the browser to Storage — they never pass through a
 *    serverless function (Vercel's 4.5 MB request limit).
 *  - MemoryLatexStore: used when the database tables don't exist yet (the
 *    editor stays fully usable, just unsaved) and by tests.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { mimeFor } from "./project-files";

export const LATEX_BUCKET = "latex-assets";

export interface ProjectFile {
  id: string;
  path: string;
  kind: "text" | "binary";
  mime: string;
  size: number;
  /** Storage object key (binary files only). */
  storagePath: string | null;
  /** File contents (text files only; empty for binaries). */
  content: string;
  updatedAt: string;
}

export interface LatexStore {
  /** False for the in-memory fallback — callers warn that changes won't persist. */
  readonly persistent: boolean;
  saveText(file: ProjectFile, content: string): Promise<void>;
  /** Creates or overwrites (by path) text files in one round trip. */
  upsertTexts(items: { path: string; content: string }[]): Promise<ProjectFile[]>;
  /** Creates or overwrites (by path) a binary file. */
  uploadBinary(path: string, bytes: Uint8Array, existing?: ProjectFile): Promise<ProjectFile>;
  rename(file: ProjectFile, newPath: string): Promise<void>;
  remove(file: ProjectFile): Promise<void>;
  setMain(path: string | null): Promise<void>;
  readBinary(file: ProjectFile): Promise<Uint8Array>;
}

type FileRow = Database["public"]["Tables"]["latex_files"]["Row"];

export function rowToFile(row: FileRow): ProjectFile {
  return {
    id: row.id,
    path: row.path,
    kind: row.kind,
    mime: row.mime_type ?? mimeFor(row.path),
    size: row.size_bytes ?? 0,
    storagePath: row.storage_path,
    content: row.kind === "text" ? row.content : "",
    updatedAt: row.updated_at,
  };
}

const byteLength = (s: string) => new TextEncoder().encode(s).length;

/** Turns raw Postgres/Storage errors into something a person can act on. */
export function friendlyStoreError(err: unknown): string {
  const message = err instanceof Error ? err.message : typeof err === "object" && err && "message" in err ? String((err as { message: unknown }).message) : String(err);
  if (/bucket not found/i.test(message)) {
    return "The file storage bucket doesn't exist yet. Run the LaTeX SQL migration (0003) in your Supabase SQL Editor, then try again.";
  }
  if (/row-level security|violates row-level|not authorized|unauthorized/i.test(message)) {
    return "You don't have permission to change this project's files (or the storage policies from migration 0003 aren't installed).";
  }
  if (/duplicate key|already exists|unique/i.test(message)) {
    return "A file with that name already exists.";
  }
  if (/payload too large|exceeded the maximum allowed size|too large/i.test(message)) {
    return "That file is too large (limit 25 MB).";
  }
  return message;
}

export class SupabaseLatexStore implements LatexStore {
  readonly persistent = true;
  private userId: string | null | undefined;

  constructor(
    private readonly supabase: SupabaseClient<Database>,
    private readonly projectId: string
  ) {}

  private async uid(): Promise<string | null> {
    if (this.userId === undefined) {
      const { data } = await this.supabase.auth.getUser();
      this.userId = data.user?.id ?? null;
    }
    return this.userId;
  }

  async saveText(file: ProjectFile, content: string) {
    const { error } = await this.supabase
      .from("latex_files")
      .update({ content, size_bytes: byteLength(content), updated_by: await this.uid() })
      .eq("id", file.id);
    if (error) throw new Error(friendlyStoreError(error));
  }

  async upsertTexts(items: { path: string; content: string }[]): Promise<ProjectFile[]> {
    if (items.length === 0) return [];
    const updated_by = await this.uid();
    const rows = items.map((i) => ({
      project_id: this.projectId,
      path: i.path,
      kind: "text" as const,
      content: i.content,
      storage_path: null,
      mime_type: mimeFor(i.path),
      size_bytes: byteLength(i.content),
      updated_by,
    }));
    const out: ProjectFile[] = [];
    // Chunked so a 300-file zip doesn't become one giant request body.
    for (let i = 0; i < rows.length; i += 50) {
      const { data, error } = await this.supabase
        .from("latex_files")
        .upsert(rows.slice(i, i + 50), { onConflict: "project_id,path" })
        .select();
      if (error) throw new Error(friendlyStoreError(error));
      out.push(...(data ?? []).map(rowToFile));
    }
    return out;
  }

  async uploadBinary(path: string, bytes: Uint8Array, existing?: ProjectFile): Promise<ProjectFile> {
    const id = existing?.id ?? crypto.randomUUID();
    const key = existing?.storagePath ?? `${this.projectId}/${id}`;
    const mime = mimeFor(path);

    const { error: upErr } = await this.supabase.storage
      .from(LATEX_BUCKET)
      .upload(key, new Blob([bytes as BlobPart], { type: mime }), { contentType: mime, upsert: true });
    if (upErr) throw new Error(friendlyStoreError(upErr));

    const { data, error } = await this.supabase
      .from("latex_files")
      .upsert(
        {
          id,
          project_id: this.projectId,
          path,
          kind: "binary" as const,
          content: "",
          storage_path: key,
          mime_type: mime,
          size_bytes: bytes.length,
          updated_by: await this.uid(),
        },
        { onConflict: "project_id,path" }
      )
      .select()
      .single();
    if (error) {
      if (!existing) await this.supabase.storage.from(LATEX_BUCKET).remove([key]); // don't orphan the object
      throw new Error(friendlyStoreError(error));
    }
    return rowToFile(data);
  }

  async rename(file: ProjectFile, newPath: string) {
    const { error } = await this.supabase
      .from("latex_files")
      .update({ path: newPath, mime_type: mimeFor(newPath), updated_by: await this.uid() })
      .eq("id", file.id);
    if (error) throw new Error(friendlyStoreError(error));
  }

  async remove(file: ProjectFile) {
    const { error } = await this.supabase.from("latex_files").delete().eq("id", file.id);
    if (error) throw new Error(friendlyStoreError(error));
    if (file.storagePath) {
      // Row is gone; a failed object delete only leaves an unreachable blob.
      await this.supabase.storage.from(LATEX_BUCKET).remove([file.storagePath]);
    }
  }

  async setMain(path: string | null) {
    const { error } = await this.supabase
      .from("latex_settings")
      .upsert({ project_id: this.projectId, main_file: path, updated_by: await this.uid() }, { onConflict: "project_id" });
    if (error) throw new Error(friendlyStoreError(error));
  }

  async readBinary(file: ProjectFile): Promise<Uint8Array> {
    if (!file.storagePath) throw new Error(`${file.path} has no stored data.`);
    const { data, error } = await this.supabase.storage.from(LATEX_BUCKET).download(file.storagePath);
    if (error || !data) throw new Error(`Couldn't download ${file.path}: ${error ? friendlyStoreError(error) : "empty response"}`);
    return new Uint8Array(await data.arrayBuffer());
  }
}

export class MemoryLatexStore implements LatexStore {
  readonly persistent = false;
  private blobs = new Map<string, Uint8Array>();
  private seq = 0;
  /** Latest main-file choice (inspectable by tests). */
  main: string | null = null;
  readonly files = new Map<string, ProjectFile>(); // by path

  private nextId() {
    return `mem-${++this.seq}`;
  }

  seed(file: ProjectFile, bytes?: Uint8Array) {
    this.files.set(file.path, file);
    if (bytes) this.blobs.set(file.id, bytes);
  }

  async saveText(file: ProjectFile, content: string) {
    for (const f of this.files.values()) if (f.id === file.id) f.content = content;
  }

  async upsertTexts(items: { path: string; content: string }[]) {
    return items.map((i) => {
      const prev = this.files.get(i.path);
      const f: ProjectFile = {
        id: prev?.id ?? this.nextId(),
        path: i.path,
        kind: "text",
        mime: mimeFor(i.path),
        size: byteLength(i.content),
        storagePath: null,
        content: i.content,
        updatedAt: new Date().toISOString(),
      };
      this.files.set(i.path, f);
      return f;
    });
  }

  async uploadBinary(path: string, bytes: Uint8Array, existing?: ProjectFile) {
    const prev = existing ?? this.files.get(path);
    const f: ProjectFile = {
      id: prev?.id ?? this.nextId(),
      path,
      kind: "binary",
      mime: mimeFor(path),
      size: bytes.length,
      storagePath: `mem/${path}`,
      content: "",
      updatedAt: new Date().toISOString(),
    };
    this.files.set(path, f);
    this.blobs.set(f.id, bytes);
    return f;
  }

  async rename(file: ProjectFile, newPath: string) {
    if (this.files.has(newPath)) throw new Error("A file with that name already exists.");
    this.files.delete(file.path);
    this.files.set(newPath, { ...file, path: newPath });
  }

  async remove(file: ProjectFile) {
    this.files.delete(file.path);
    this.blobs.delete(file.id);
  }

  async setMain(path: string | null) {
    this.main = path;
  }

  async readBinary(file: ProjectFile) {
    const bytes = this.blobs.get(file.id);
    if (!bytes) throw new Error(`Couldn't read ${file.path}.`);
    return bytes;
  }
}
