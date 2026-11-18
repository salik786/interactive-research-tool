"use client";

import * as React from "react";
import { Loader2, Download, ClipboardCopy, TriangleAlert, File as FileIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBytes, previewKind } from "@/lib/latex/project-files";
import type { ProjectFile } from "@/lib/latex/store";

/**
 * Viewer for non-text project files (figures, PDFs…). The parent mounts it
 * with `key={file.id + file.updatedAt}` so state resets whenever the file
 * changes — no synchronous resets inside the effect.
 */
export function BinaryPreview({
  file,
  load,
  onDownload,
  onCopySnippet,
}: {
  file: ProjectFile;
  load: (file: ProjectFile) => Promise<Uint8Array>;
  onDownload: (file: ProjectFile) => void;
  onCopySnippet: (file: ProjectFile) => void;
}) {
  const kind = previewKind(file.path, file.kind);
  const [url, setUrl] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [dims, setDims] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (kind !== "image" && kind !== "pdf") return;
    let revoked = false;
    let objectUrl: string | null = null;
    load(file)
      .then((bytes) => {
        if (revoked) return;
        objectUrl = URL.createObjectURL(new Blob([bytes as BlobPart], { type: file.mime }));
        setUrl(objectUrl);
      })
      .catch((err) => {
        if (!revoked) setError(err instanceof Error ? err.message : "Couldn't load this file.");
      });
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file, kind, load]);

  const loading = (kind === "image" || kind === "pdf") && !url && !error;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2 text-xs text-text-secondary">
        <span>
          {file.mime} · {formatBytes(file.size)}
          {dims ? ` · ${dims}` : ""}
        </span>
        <div className="flex gap-1">
          {(kind === "image" || kind === "pdf") && (
            <Button size="sm" variant="outline" onClick={() => onCopySnippet(file)}>
              <ClipboardCopy className="h-3.5 w-3.5" /> Copy figure snippet
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => onDownload(file)}>
            <Download className="h-3.5 w-3.5" /> Download
          </Button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-auto bg-surface-alt">
        {loading && (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-text-secondary" role="status">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        )}
        {error && (
          <p className="flex items-start gap-2 p-4 text-sm text-danger" role="alert">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </p>
        )}
        {url && kind === "image" && (
          <div className="flex min-h-full items-center justify-center p-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- blob: URL of a user-uploaded figure; next/image can't optimise it */}
            <img
              src={url}
              alt={`Preview of ${file.path}`}
              className="max-h-full max-w-full rounded border border-border bg-white object-contain"
              onLoad={(e) => setDims(`${e.currentTarget.naturalWidth} × ${e.currentTarget.naturalHeight}px`)}
            />
          </div>
        )}
        {url && kind === "pdf" && <iframe src={url} title={`Preview of ${file.path}`} className="h-full w-full" />}
        {kind === "other" && (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-text-secondary">
            <FileIcon className="h-8 w-8" aria-hidden />
            <p>No preview for this file type. It&apos;s still available to your document when you compile.</p>
          </div>
        )}
      </div>
    </div>
  );
}
