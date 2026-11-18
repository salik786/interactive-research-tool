/**
 * Minimal BibTeX reader + IEEE-ish formatter. Used only by the .docx export so
 * `\cite{key}` + `\bibliography{refs}` documents (the normal Overleaf setup)
 * come out with real numbered references instead of bare keys. The PDF itself
 * is produced by real BibTeX in the TeX engine — this never affects it.
 */

export interface BibEntry {
  key: string;
  type: string;
  fields: Record<string, string>;
}

/** Reads a {…} or "…" value starting at `i`, returning the raw inner text and the index after it. */
function readValue(src: string, i: number): { value: string; end: number } {
  while (/\s/.test(src[i] ?? "")) i++;
  const parts: string[] = [];
  for (;;) {
    while (/\s/.test(src[i] ?? "")) i++;
    const ch = src[i];
    if (ch === "{") {
      let depth = 0;
      let j = i;
      for (; j < src.length; j++) {
        if (src[j] === "\\") j++;
        else if (src[j] === "{") depth++;
        else if (src[j] === "}" && --depth === 0) break;
      }
      parts.push(src.slice(i + 1, j));
      i = j + 1;
    } else if (ch === '"') {
      let j = i + 1;
      for (; j < src.length; j++) {
        if (src[j] === "\\") j++;
        else if (src[j] === '"') break;
      }
      parts.push(src.slice(i + 1, j));
      i = j + 1;
    } else {
      // bare number or @string macro name
      const m = /^[^\s,#}]+/.exec(src.slice(i));
      if (!m) break;
      parts.push(m[0]);
      i += m[0].length;
    }
    while (/\s/.test(src[i] ?? "")) i++;
    if (src[i] === "#") {
      i++; // string concatenation
      continue;
    }
    break;
  }
  return { value: parts.join(""), end: i };
}

export function parseBib(text: string): Map<string, BibEntry> {
  const entries = new Map<string, BibEntry>();
  const re = /@([A-Za-z]+)\s*[{(]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const type = m[1].toLowerCase();
    if (["comment", "string", "preamble"].includes(type)) continue;
    let i = m.index + m[0].length;
    const keyEnd = text.indexOf(",", i);
    if (keyEnd === -1) break;
    const key = text.slice(i, keyEnd).trim();
    i = keyEnd + 1;
    const fields: Record<string, string> = {};
    for (;;) {
      while (/[\s,]/.test(text[i] ?? "")) i++;
      if (i >= text.length || text[i] === "}" || text[i] === ")") break;
      const nameMatch = /^([A-Za-z][A-Za-z0-9_-]*)\s*=/.exec(text.slice(i));
      if (!nameMatch) break;
      i += nameMatch[0].length;
      const { value, end } = readValue(text, i);
      fields[nameMatch[1].toLowerCase()] = value.replace(/\s+/g, " ").trim();
      i = end;
    }
    if (key) entries.set(key, { key, type, fields });
    re.lastIndex = Math.max(re.lastIndex, i);
  }
  return entries;
}

/** "Smith, John Q." / "John Q. Smith" → "J. Q. Smith" */
function shortAuthor(name: string): string {
  const clean = name.replace(/[{}]/g, "").trim();
  if (!clean) return "";
  let first: string;
  let last: string;
  if (clean.includes(",")) {
    const [l, f] = clean.split(",", 2);
    last = l.trim();
    first = (f ?? "").trim();
  } else {
    const words = clean.split(/\s+/);
    last = words.pop() ?? "";
    first = words.join(" ");
  }
  const initials = first
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((w) => `${w[0].toUpperCase()}.`)
    .join(" ");
  return [initials, last].filter(Boolean).join(" ");
}

function formatAuthors(field: string | undefined): string {
  if (!field) return "";
  const names = field.split(/\s+and\s+/i).map(shortAuthor).filter(Boolean);
  if (names.length === 0) return "";
  if (names.length <= 2) return names.join(" and ");
  return `${names.slice(0, 2).join(", ")}, et al.`;
}

/** One reference as a single LaTeX-ish line (accents/braces are cleaned later by the docx text pipeline). */
export function formatBibEntry(e: BibEntry): string {
  const f = e.fields;
  const authors = formatAuthors(f.author || f.editor);
  const title = f.title ? `“${f.title.replace(/[{}]/g, "")},”` : "";
  const venue = f.journal || f.booktitle || f.publisher || f.howpublished || f.school || f.institution || "";
  const bits: string[] = [];
  if (f.volume) bits.push(`vol. ${f.volume}`);
  if (f.number) bits.push(`no. ${f.number}`);
  if (f.pages) bits.push(`pp. ${f.pages.replace(/--+/g, "–")}`);
  if (f.year) bits.push(f.year);
  const tail = [venue ? `\\textit{${venue.replace(/[{}]/g, "")}}` : "", ...bits].filter(Boolean).join(", ");
  const doi = f.doi ? ` doi:${f.doi}` : "";
  return [authors ? `${authors},` : "", title, tail ? `${tail}.` : "", doi].filter(Boolean).join(" ").trim();
}

/** Citation keys in order of first appearance. */
export function citationOrder(body: string): string[] {
  const seen: string[] = [];
  const re = /\\(?:cite|citep|citet|citeauthor|citeyear|parencite|textcite|autocite)\*?(?:\s*\[[^\]]*\]){0,2}\s*\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    for (const key of m[1].split(",")) {
      const k = key.trim();
      if (k && !seen.includes(k)) seen.push(k);
    }
  }
  return seen;
}

/**
 * Replaces `\bibliography{…}` with a synthesised `thebibliography` built from
 * the .bib text, numbered in citation order. Returns the body untouched if there
 * is nothing to expand.
 */
export function expandBibliography(body: string, bibText: string): { body: string; missingKeys: string[] } {
  if (!bibText.trim() || /\\begin\{thebibliography\}/.test(body)) return { body, missingKeys: [] };
  const hasBibCommand = /^[^%\n]*\\bibliography\s*\{[^}]*\}/m.test(body);
  if (!hasBibCommand) return { body, missingKeys: [] };

  const db = parseBib(bibText);
  const order = citationOrder(body);
  const missingKeys = order.filter((k) => !db.has(k));
  const items = order
    .filter((k) => db.has(k))
    .map((k) => `\\bibitem{${k}} ${formatBibEntry(db.get(k)!)}`);
  if (items.length === 0) return { body, missingKeys };

  const block = `\\begin{thebibliography}{99}\n${items.join("\n")}\n\\end{thebibliography}`;
  return { body: body.replace(/^[^%\n]*\\bibliography\s*\{[^}]*\}[^\n]*/m, () => block), missingKeys };
}
