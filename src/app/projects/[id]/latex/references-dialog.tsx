"use client";

import * as React from "react";
import {
  ShieldCheck,
  Loader2,
  CircleCheck,
  TriangleAlert,
  CircleX,
  CircleHelp,
  ExternalLink,
  ChevronDown,
  FileSearch,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { extname } from "@/lib/latex/project-files";
import { bibFamilyNames, cleanDoi, localChecks, normalizeText, setBibField, titleSimilarity, verifyAll, type RefResult, type RefStatus } from "@/lib/latex/ref-verify";
import type { ProjectFile } from "@/lib/latex/store";

const STATUS: Record<RefStatus | "unchecked", { label: string; badge: "success" | "warning" | "danger" | "secondary"; icon: React.ElementType }> = {
  verified: { label: "Verified", badge: "success", icon: CircleCheck },
  check: { label: "Check", badge: "warning", icon: TriangleAlert },
  "not-found": { label: "Not found", badge: "danger", icon: CircleX },
  skipped: { label: "Skipped", badge: "secondary", icon: CircleHelp },
  error: { label: "Lookup failed", badge: "secondary", icon: CircleHelp },
  unchecked: { label: "Not checked", badge: "secondary", icon: CircleHelp },
};

export function ReferencesDialog({
  open,
  onOpenChange,
  files,
  onApplyFix,
  onOpenEntry,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  files: ProjectFile[];
  onApplyFix: (path: string, content: string) => void;
  onOpenEntry: (path: string, line: number) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col gap-3 overflow-hidden">
        <ReferencesBody files={files} onApplyFix={onApplyFix} onOpenEntry={(p, l) => { onOpenChange(false); onOpenEntry(p, l); }} />
      </DialogContent>
    </Dialog>
  );
}

function ReferencesBody({
  files,
  onApplyFix,
  onOpenEntry,
}: {
  files: ProjectFile[];
  onApplyFix: (path: string, content: string) => void;
  onOpenEntry: (path: string, line: number) => void;
}) {
  const bibFiles = React.useMemo(
    () => files.filter((f) => f.kind === "text" && extname(f.path) === "bib").map((f) => ({ path: f.path, content: f.content })),
    [files]
  );
  const texSources = React.useMemo(
    () => files.filter((f) => f.kind === "text" && extname(f.path) === "tex").map((f) => f.content),
    [files]
  );
  const report = React.useMemo(() => localChecks(bibFiles, texSources), [bibFiles, texSources]);

  const [results, setResults] = React.useState<Map<string, RefResult>>(() => new Map());
  const [running, setRunning] = React.useState(false);
  const [progress, setProgress] = React.useState({ done: 0, total: 0 });
  const [filter, setFilter] = React.useState<"problems" | "all">("all");
  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set());
  const abortRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => () => abortRef.current?.abort(), []);

  const run = async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const list = report.entries.map((e) => e.entry);
    setRunning(true);
    setProgress({ done: 0, total: list.length });
    setFilter("problems");
    let done = 0;
    await verifyAll(list, {
      signal: ctrl.signal,
      onResult: (r) => {
        done++;
        setProgress({ done, total: list.length });
        setResults((prev) => new Map(prev).set(r.key, r));
      },
    });
    if (abortRef.current === ctrl) setRunning(false);
  };

  const stop = () => {
    abortRef.current?.abort();
    setRunning(false);
  };

  const applyFix = (file: string, key: string, field: "doi" | "year", value: string) => {
    const current = bibFiles.find((b) => b.path === file)?.content;
    if (current === undefined) return;
    const next = setBibField(current, key, field, value);
    if (next === null) return;
    onApplyFix(file, next);
    setResults((prev) => {
      const r = prev.get(key);
      if (!r) return prev;
      return new Map(prev).set(key, {
        ...r,
        suggestions: r.suggestions.filter((x) => x.field !== field),
        note: `${r.note ?? ""} Applied ${field} = ${value} — press Re-check to confirm.`.trim(),
      });
    });
  };

  const missingByKey = new Map(report.missingFields.map((m) => [m.key, m.missing]));
  const counts = { verified: 0, check: 0, "not-found": 0, other: 0 };
  for (const r of results.values()) {
    if (r.status === "verified") counts.verified++;
    else if (r.status === "check") counts.check++;
    else if (r.status === "not-found") counts["not-found"]++;
    else counts.other++;
  }

  const rows = report.entries.filter(({ entry }) => {
    if (filter === "all") return true;
    const r = results.get(entry.key);
    return (r && r.status !== "verified") || missingByKey.has(entry.key) || (r?.suggestions.length ?? 0) > 0;
  });

  const localProblems =
    report.undefinedKeys.length + report.duplicateKeys.length + report.duplicateDois.length + report.missingFields.length;

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" /> Check references
        </DialogTitle>
        <DialogDescription>
          Cross-checks every entry in your .bib against Crossref, DataCite and OpenAlex — catching invented DOIs, wrong years or
          authors, and references that don&apos;t exist. Only each entry&apos;s title, first author, year and DOI are sent to these
          public catalogues.
        </DialogDescription>
      </DialogHeader>

      {report.entries.length === 0 ? (
        <p className="rounded-md border border-border p-4 text-sm text-text-secondary">
          No .bib entries found. Upload or create a <code>.bib</code> file first.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {running ? (
              <Button variant="outline" onClick={stop}>
                <Loader2 className="h-4 w-4 animate-spin" /> Stop ({progress.done}/{progress.total})
              </Button>
            ) : (
              <Button onClick={() => void run()}>
                <FileSearch className="h-4 w-4" /> {results.size ? "Re-check" : "Verify"} {report.entries.length} reference
                {report.entries.length === 1 ? "" : "s"} online
              </Button>
            )}
            {results.size > 0 && (
              <div className="flex flex-wrap gap-1.5 text-xs">
                <Badge variant="success">{counts.verified} verified</Badge>
                {counts.check > 0 && <Badge variant="warning">{counts.check} to check</Badge>}
                {counts["not-found"] > 0 && <Badge variant="danger">{counts["not-found"]} not found</Badge>}
                {counts.other > 0 && <Badge variant="secondary">{counts.other} skipped/failed</Badge>}
              </div>
            )}
          </div>
          {running && (
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-alt" role="progressbar" aria-valuenow={progress.done} aria-valuemax={progress.total}>
              <div className="h-full bg-primary transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
            </div>
          )}

          {(localProblems > 0 || report.unusedKeys.length > 0) && (
            <div className="grid gap-1 rounded-md border border-border bg-surface-alt p-3 text-xs">
              {report.undefinedKeys.length > 0 && (
                <p className="text-danger">
                  <strong>Cited but not in any .bib:</strong> {report.undefinedKeys.join(", ")}
                </p>
              )}
              {report.duplicateKeys.length > 0 && (
                <p className="text-danger">
                  <strong>Duplicate keys:</strong> {report.duplicateKeys.join(", ")} (BibTeX uses the first one)
                </p>
              )}
              {report.duplicateDois.map((d) => (
                <p key={d.doi} className="text-warning">
                  <strong>Same DOI in several entries:</strong> {d.keys.join(", ")} ({d.doi})
                </p>
              ))}
              {report.missingFields.length > 0 && (
                <p className="text-warning">
                  <strong>Missing required fields:</strong>{" "}
                  {report.missingFields.map((m) => `${m.key} (${m.missing.join(", ")})`).join("; ")}
                </p>
              )}
              {report.unusedKeys.length > 0 && (
                <p className="text-text-secondary">
                  <strong>Not cited anywhere ({report.unusedKeys.length}):</strong> {report.unusedKeys.slice(0, 12).join(", ")}
                  {report.unusedKeys.length > 12 ? "…" : ""}
                </p>
              )}
            </div>
          )}

          <div className="flex gap-1 text-sm" role="tablist">
            {(["problems", "all"] as const).map((f) => (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={filter === f}
                onClick={() => setFilter(f)}
                className={cn("min-h-9 rounded-md px-3", filter === f ? "bg-primary/10 font-medium text-primary" : "text-text-secondary hover:bg-surface-alt")}
              >
                {f === "problems" ? "Needs attention" : `All (${report.entries.length})`}
              </button>
            ))}
          </div>

          <ul className="-mx-1 min-h-0 flex-1 overflow-auto px-1">
            {rows.length === 0 && (
              <li className="p-4 text-center text-sm text-text-secondary">
                {results.size ? "Nothing needs attention." : "Run the check to see results."}
              </li>
            )}
            {rows.map(({ file, entry }) => {
              const r = results.get(entry.key);
              const st = STATUS[r?.status ?? "unchecked"];
              const Icon = st.icon;
              const isOpen = expanded.has(entry.key);
              const missing = missingByKey.get(entry.key);
              const content = bibFiles.find((b) => b.path === file)?.content ?? "";
              const line = content.slice(0, entry.start).split("\n").length;
              return (
                <li key={`${file}:${entry.key}`} className="border-b border-border last:border-0">
                  <button
                    type="button"
                    onClick={() =>
                      setExpanded((prev) => {
                        const n = new Set(prev);
                        if (n.has(entry.key)) n.delete(entry.key);
                        else n.add(entry.key);
                        return n;
                      })
                    }
                    className="flex min-h-11 w-full items-center gap-2 py-2 text-left"
                    aria-expanded={isOpen}
                  >
                    <Icon
                      className={cn(
                        "h-4 w-4 shrink-0",
                        st.badge === "success" && "text-success",
                        st.badge === "warning" && "text-warning",
                        st.badge === "danger" && "text-danger",
                        st.badge === "secondary" && "text-text-secondary"
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-xs text-text-secondary">{entry.key}</span>
                      <span className="block truncate text-sm">{entry.fields.title?.replace(/[{}]/g, "") || <em>No title</em>}</span>
                    </span>
                    {(r?.suggestions.length ?? 0) > 0 && <Wrench className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="Fix available" />}
                    <Badge variant={st.badge}>{st.label}</Badge>
                    <ChevronDown className={cn("h-4 w-4 shrink-0 text-text-secondary transition-transform", isOpen && "rotate-180")} />
                  </button>

                  {isOpen && (
                    <div className="grid gap-2 pb-3 pl-6 text-xs">
                      {missing && <p className="text-warning">Missing required field(s): {missing.join(", ")}.</p>}
                      {r?.issues.map((i) => (
                        <p key={i} className={r.status === "verified" ? "text-text-secondary" : "text-text-primary"}>
                          • {i}
                        </p>
                      ))}
                      {r?.found && (
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[480px] border-collapse text-left">
                            <thead>
                              <tr className="text-text-secondary">
                                <th className="w-16 py-1 pr-2 font-medium" />
                                <th className="py-1 pr-2 font-medium">Your .bib</th>
                                <th className="py-1 font-medium">{r.found.source}</th>
                              </tr>
                            </thead>
                            <tbody className="align-top">
                              <Row
                                label="Title"
                                mine={entry.fields.title?.replace(/[{}]/g, "")}
                                theirs={r.found.title}
                                differs={titleSimilarity(entry.fields.title ?? "", r.found.title) < 0.9}
                              />
                              <Row
                                label="Authors"
                                mine={entry.fields.author?.replace(/[{}]/g, "")}
                                theirs={r.found.authors.slice(0, 6).join(", ") + (r.found.authors.length > 6 ? ", …" : "")}
                                differs={(() => {
                                  const first = bibFamilyNames(entry.fields.author)[0];
                                  return !!first && r.found.authors.length > 0 && !r.found.authors.some((a) => normalizeText(a).split(" ").includes(first));
                                })()}
                              />
                              <Row label="Year" mine={entry.fields.year} theirs={r.found.year ? String(r.found.year) : undefined} differs={!!entry.fields.year && !!r.found.year && entry.fields.year.trim() !== String(r.found.year)} />
                              <Row label="Venue" mine={(entry.fields.journal ?? entry.fields.booktitle ?? entry.fields.publisher)?.replace(/[{}]/g, "")} theirs={r.found.venue} differs={false} />
                              <Row label="DOI" mine={entry.fields.doi} theirs={r.found.doi} differs={!!entry.fields.doi && !!r.found.doi && cleanDoi(entry.fields.doi)?.toLowerCase() !== r.found.doi.toLowerCase()} />
                            </tbody>
                          </table>
                        </div>
                      )}
                      {r?.note && <p className="text-text-secondary">{r.note}</p>}
                      <div className="flex flex-wrap gap-2">
                        {r?.suggestions.map((s) => (
                          <Button key={s.field} size="sm" onClick={() => applyFix(file, entry.key, s.field, s.value)}>
                            <Wrench className="h-3.5 w-3.5" /> {s.field === "doi" ? (entry.fields.doi ? "Replace DOI with" : "Add DOI") : "Set year to"} {s.value}
                          </Button>
                        ))}
                        <Button size="sm" variant="outline" onClick={() => onOpenEntry(file, line)}>
                          Open in {file}:{line}
                        </Button>
                        {r?.found?.url && (
                          <a
                            href={r.found.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex h-9 items-center gap-1 rounded-md px-2 text-primary hover:underline"
                          >
                            View record <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}

function Row({ label, mine, theirs, differs }: { label: string; mine?: string; theirs?: string; differs: boolean }) {
  return (
    <tr className="border-t border-border">
      <td className="py-1 pr-2 text-text-secondary">{label}</td>
      <td className={cn("py-1 pr-2 break-words", differs && mine && "font-medium text-warning")}>{mine || <span className="text-text-secondary">—</span>}</td>
      <td className="py-1 break-words">{theirs || <span className="text-text-secondary">—</span>}</td>
    </tr>
  );
}
