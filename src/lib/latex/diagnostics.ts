/** Turns raw TeX engine output into messages people can act on. Pure functions. */

export interface ExplainedError {
  /** Full, human-readable message (hints appended). */
  message: string;
  /** Source file the error points at, when the engine reported one. */
  file: string | null;
  line: number | null;
}

const FILE_LINE = /^\/?([^\s:][^:]*?\.(?:tex|sty|cls|bib|def|cfg)):(\d+):\s*/i;

/**
 * TeX often reports a missing file as "Emergency stop" because the engine can't
 * prompt for a replacement. The real cause is the first `! …` line in the log.
 */
function firstLogError(log: string): string | null {
  for (const line of log.split("\n")) {
    const m = /^! (.+)$/.exec(line);
    if (m && !/^Emergency stop|^==> Fatal error/i.test(m[1])) return m[1].trim();
  }
  return null;
}

export function explainTexError(rawMessage: string, log = ""): ExplainedError {
  let file: string | null = null;
  let line: number | null = null;
  let body = rawMessage;
  const m = FILE_LINE.exec(rawMessage);
  if (m) {
    file = m[1].replace(/^\.?\//, "");
    line = Number(m[2]);
    body = rawMessage.slice(m[0].length);
  }
  if (/^\s*(Emergency stop|Fatal error)/i.test(body)) {
    const real = firstLogError(log);
    if (real) body = real;
  }
  const raw = file ? `${file}, line ${line}: ${body}` : body;

  const hints: string[] = [];
  if (/Font (?:ec|tc)[a-z]+\d+ at \d+ not found/i.test(raw)) {
    hints.push(
      "this document uses T1-encoded Computer Modern fonts, which aren't bundled in the in-browser engine. Add \\usepackage{lmodern} right after \\usepackage[T1]{fontenc}."
    );
  }
  const missing = /File [`'"]?([^`'"\s]+)['"]? not found/i.exec(raw);
  if (missing) {
    hints.push(
      `"${missing[1]}" isn't in the project. Upload it (paths are relative to the project root, e.g. figures/plot.png), or fix the name in your \\includegraphics / \\input / \\usepackage line.`
    );
  }
  if (/requires Biber/i.test(raw)) {
    hints.push(
      "the in-browser engine can't run Biber. Use \\usepackage[backend=bibtex]{biblatex}, or classic \\bibliographystyle + \\bibliography with a .bib file, or upload the generated .bbl."
    );
  }
  return { message: hints.length ? `${raw}\n\nHint: ${hints.join(" ")}` : raw, file, line };
}

export interface LogWarnings {
  citations: string[];
  references: string[];
}

/** Pulls the warnings that matter for papers: undefined citations / cross-references. */
export function extractLogWarnings(log: string): LogWarnings {
  const citations = new Set<string>();
  const references = new Set<string>();
  for (const m of log.matchAll(/Citation [`']([^'`]+)' on page \d+ undefined/g)) citations.add(m[1]);
  for (const m of log.matchAll(/I didn't find a database entry for "([^"]+)"/g)) citations.add(m[1]);
  for (const m of log.matchAll(/Reference [`']([^'`]+)' on page \d+ undefined/g)) references.add(m[1]);
  return { citations: [...citations], references: [...references] };
}

export function hasWarnings(w: LogWarnings): boolean {
  return w.citations.length > 0 || w.references.length > 0;
}
