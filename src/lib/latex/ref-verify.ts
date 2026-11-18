/**
 * Reference verification, entirely from the browser against open scholarly
 * catalogues (all CORS-enabled, no API key):
 *   - Crossref   — journal/conference DOIs and bibliographic search
 *   - DataCite   — software/dataset DOIs (Zenodo, figshare …)
 *   - OpenAlex   — broad search fallback (arXiv, books, theses …)
 * Only the reference's DOI / title / first author / year are sent; nothing
 * else from the project leaves the browser.
 *
 * Plus instant local checks that need no network: citations with no .bib
 * entry, unused entries, duplicate keys/DOIs, missing required fields.
 */
import { citationOrder, parseBib, readValue, type BibEntry } from "./bibtex";

export type RefStatus = "verified" | "check" | "not-found" | "skipped" | "error";

export interface FoundRecord {
  source: "Crossref" | "DataCite" | "OpenAlex";
  doi?: string;
  title: string;
  authors: string[]; // display names
  year?: number;
  venue?: string;
  url?: string;
}

export interface RefResult {
  key: string;
  status: RefStatus;
  found?: FoundRecord;
  issues: string[];
  /** One-click fixes the user can apply to the .bib. */
  suggestions: { field: "doi" | "year"; value: string }[];
  note?: string;
  titleScore?: number;
}

// ───────────────────────────── text normalisation ─────────────────────────────
export function normalizeText(s: string): string {
  return s
    .replace(/\\[`'^"~=.uvHtcdbk]\s*\{?\s*([a-zA-Z])\s*\}?/g, "$1") // accents \"{o} → o
    .replace(/\\[a-zA-Z]+\s*/g, " ") // other commands
    .replace(/[{}$]/g, "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const STOP = new Set(["a", "an", "the", "of", "and", "for", "in", "on", "to", "with", "via", "by", "from", "at", "is"]);
const tokens = (s: string) => normalizeText(s).split(" ").filter((w) => w.length > 1 && !STOP.has(w));

/** 0–1 similarity of two titles (Dice on words, tolerant of a dropped/added subtitle). */
export function titleSimilarity(a: string, b: string): number {
  const A = new Set(tokens(a));
  const B = new Set(tokens(b));
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  const dice = (2 * inter) / (A.size + B.size);
  const minSize = Math.min(A.size, B.size);
  const containment = inter / minSize;
  return minSize >= 4 && containment >= 0.95 ? Math.max(dice, 0.92) : dice;
}

/** Family names from a BibTeX author field ("Smith, J. and Jane Doe" → ["smith","doe"]). */
export function bibFamilyNames(field: string | undefined): string[] {
  if (!field) return [];
  return field
    .split(/\s+and\s+/i)
    .map((n) => n.trim())
    .filter((n) => n && n.toLowerCase() !== "others")
    .map((n) => {
      const clean = n.replace(/^\{(.*)\}$/, "$1");
      const fam = clean.includes(",") ? clean.split(",")[0] : clean.split(/\s+/).pop() ?? "";
      return normalizeText(fam);
    })
    .filter(Boolean);
}

const familyOf = (display: string) => normalizeText(display.includes(",") ? display.split(",")[0] : display.split(/\s+/).pop() ?? "");

export function cleanDoi(raw: string | undefined): string | null {
  if (!raw) return null;
  const m = /10\.\d{4,9}\/[^\s"<>{}]+/i.exec(raw.replace(/\\_/g, "_"));
  return m ? m[0].replace(/[.,;]+$/, "") : null;
}

// ───────────────────────────── catalogue clients ─────────────────────────────
type Fetcher = (url: string, signal?: AbortSignal) => Promise<unknown | null>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** GET JSON; null on 404; one retry on rate-limit / server errors. */
export const fetchJson: Fetcher = async (url, signal) => {
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, { signal, headers: { Accept: "application/json" } });
    } catch (err) {
      // "Failed to fetch": a network blip, or a rate-limit reply without CORS headers. Retry once.
      if (signal?.aborted || attempt === 1) throw err;
      await sleep(1500);
      continue;
    }
    if (res.status === 404) return null;
    if (res.ok) return res.json();
    if ((res.status === 429 || res.status >= 500) && attempt === 0) {
      await sleep(1500);
      continue;
    }
    throw new Error(`HTTP ${res.status} from ${new URL(url).hostname}`);
  }
  return null;
};

type CrossrefWork = {
  DOI?: string;
  title?: string[];
  author?: { family?: string; given?: string; name?: string }[];
  issued?: { "date-parts"?: number[][] };
  published?: { "date-parts"?: number[][] };
  "container-title"?: string[];
  publisher?: string;
  URL?: string;
};

function fromCrossref(w: CrossrefWork): FoundRecord {
  const year = w.issued?.["date-parts"]?.[0]?.[0] ?? w.published?.["date-parts"]?.[0]?.[0];
  return {
    source: "Crossref",
    doi: w.DOI,
    title: w.title?.[0] ?? "",
    authors: (w.author ?? []).map((a) => (a.family ? `${a.given ? a.given + " " : ""}${a.family}` : a.name ?? "")).filter(Boolean),
    year: typeof year === "number" ? year : undefined,
    venue: w["container-title"]?.[0] || w.publisher,
    url: w.DOI ? `https://doi.org/${w.DOI}` : w.URL,
  };
}

async function crossrefByDoi(doi: string, f: Fetcher, signal?: AbortSignal): Promise<FoundRecord | null> {
  const data = (await f(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, signal)) as { message?: CrossrefWork } | null;
  return data?.message ? fromCrossref(data.message) : null;
}

async function dataciteByDoi(doi: string, f: Fetcher, signal?: AbortSignal): Promise<FoundRecord | null> {
  type DC = { data?: { attributes?: { doi?: string; titles?: { title: string }[]; creators?: { name?: string; familyName?: string; givenName?: string }[]; publicationYear?: number; publisher?: string | { name?: string }; url?: string } } };
  const data = (await f(`https://api.datacite.org/dois/${encodeURIComponent(doi)}`, signal)) as DC | null;
  const a = data?.data?.attributes;
  if (!a) return null;
  return {
    source: "DataCite",
    doi: a.doi,
    title: a.titles?.[0]?.title ?? "",
    authors: (a.creators ?? []).map((c) => (c.familyName ? `${c.givenName ? c.givenName + " " : ""}${c.familyName}` : c.name ?? "")).filter(Boolean),
    year: a.publicationYear ? Number(a.publicationYear) : undefined,
    venue: typeof a.publisher === "string" ? a.publisher : a.publisher?.name,
    url: a.doi ? `https://doi.org/${a.doi}` : a.url,
  };
}

async function crossrefSearch(q: string, f: Fetcher, signal?: AbortSignal): Promise<FoundRecord[]> {
  const url = `https://api.crossref.org/works?rows=5&select=DOI,title,author,issued,published,container-title,publisher,URL&query.bibliographic=${encodeURIComponent(q)}`;
  const data = (await f(url, signal)) as { message?: { items?: CrossrefWork[] } } | null;
  return (data?.message?.items ?? []).map(fromCrossref);
}

async function openalexSearch(title: string, f: Fetcher, signal?: AbortSignal): Promise<FoundRecord[]> {
  type OA = { results?: { display_name?: string; publication_year?: number; doi?: string | null; id?: string; authorships?: { author?: { display_name?: string } }[]; primary_location?: { source?: { display_name?: string } | null } | null }[] };
  const url = `https://api.openalex.org/works?per_page=5&search=${encodeURIComponent(title.slice(0, 250))}`;
  const data = (await f(url, signal)) as OA | null;
  return (data?.results ?? []).map((r) => ({
    source: "OpenAlex" as const,
    doi: r.doi ? r.doi.replace(/^https?:\/\/doi\.org\//i, "") : undefined,
    title: r.display_name ?? "",
    authors: (r.authorships ?? []).map((x) => x.author?.display_name ?? "").filter(Boolean),
    year: r.publication_year,
    venue: r.primary_location?.source?.display_name,
    url: r.doi ?? r.id,
  }));
}

// ───────────────────────────── comparison ─────────────────────────────
function compare(entry: BibEntry, rec: FoundRecord): Omit<RefResult, "key"> {
  const issues: string[] = [];
  const suggestions: RefResult["suggestions"] = [];
  let serious = false;

  const title = entry.fields.title ?? "";
  const score = title ? titleSimilarity(title, rec.title) : 0;
  if (title && score < 0.75) {
    issues.push(`Title doesn't match the ${rec.source} record: “${rec.title}”.`);
    serious = true;
  } else if (title && score < 0.9) {
    issues.push(`Title differs slightly from the ${rec.source} record: “${rec.title}”.`);
  }

  const bibYear = Number((entry.fields.year ?? "").replace(/\D/g, "").slice(0, 4)) || null;
  if (!bibYear && rec.year) {
    issues.push(`No year in your .bib — the record says ${rec.year}.`);
    suggestions.push({ field: "year", value: String(rec.year) });
  } else if (bibYear && rec.year && bibYear !== rec.year) {
    const diff = Math.abs(bibYear - rec.year);
    issues.push(
      diff === 1
        ? `Year is ${bibYear} in your .bib but ${rec.year} in ${rec.source} (often preprint vs. published version).`
        : `Year is ${bibYear} in your .bib but ${rec.year} in ${rec.source}.`
    );
    if (diff > 1) serious = true;
    suggestions.push({ field: "year", value: String(rec.year) });
  }

  const bibFamilies = bibFamilyNames(entry.fields.author ?? entry.fields.editor);
  const recFamilies = rec.authors.map(familyOf).filter(Boolean);
  if (bibFamilies.length && recFamilies.length) {
    const first = bibFamilies[0];
    const match = recFamilies.some((r) => r === first || r.endsWith(first) || first.endsWith(r));
    if (!match) {
      issues.push(`First author “${first}” isn't among the record's authors (${rec.authors.slice(0, 3).join(", ")}${rec.authors.length > 3 ? ", …" : ""}).`);
      serious = true;
    }
  }

  const bibDoi = cleanDoi(entry.fields.doi);
  if (!bibDoi && rec.doi) suggestions.push({ field: "doi", value: rec.doi });

  return {
    status: serious ? "check" : "verified",
    found: rec,
    issues,
    suggestions,
    titleScore: score,
  };
}

const UNINDEXED_TYPES = new Set(["misc", "online", "software", "manual", "techreport", "unpublished", "electronic", "www", "dataset"]);

const cache = new Map<string, RefResult>();

export async function verifyEntry(entry: BibEntry, signal?: AbortSignal, f: Fetcher = fetchJson): Promise<RefResult> {
  const cacheKey = JSON.stringify([entry.key, entry.type, entry.fields]);
  const hit = cache.get(cacheKey);
  if (hit) return hit;

  const base = { key: entry.key, issues: [] as string[], suggestions: [] as RefResult["suggestions"] };
  const title = entry.fields.title ?? "";
  const doi = cleanDoi(entry.fields.doi) ?? cleanDoi(entry.fields.url);
  let result: RefResult;

  try {
    let badDoi = false;
    if (doi) {
      const rec = (await crossrefByDoi(doi, f, signal)) ?? (await dataciteByDoi(doi, f, signal));
      if (rec) {
        const cmp = compare(entry, rec);
        if (title && (cmp.titleScore ?? 0) < 0.5) {
          cmp.issues.unshift(`The DOI ${doi} belongs to a different work.`);
        }
        result = { ...base, ...cmp, note: `Checked by DOI in ${rec.source}.` };
        cache.set(cacheKey, result);
        return result;
      }
      badDoi = true;
    }

    if (!title) {
      result = { ...base, status: badDoi ? "not-found" : "skipped", issues: badDoi ? [`DOI ${doi} doesn't exist in Crossref or DataCite.`] : [], note: "No title to search for." };
      cache.set(cacheKey, result);
      return result;
    }

    const firstAuthor = bibFamilyNames(entry.fields.author ?? entry.fields.editor)[0] ?? "";
    const year = (entry.fields.year ?? "").replace(/\D/g, "").slice(0, 4);
    const candidates = await crossrefSearch([title, firstAuthor, year].filter(Boolean).join(" "), f, signal);
    let best = candidates.map((c) => ({ c, s: titleSimilarity(title, c.title) })).sort((a, b) => b.s - a.s)[0];
    let openAlexDown = false;
    if (!best || best.s < 0.85) {
      try {
        const oa = (await openalexSearch(title, f, signal)).map((c) => ({ c, s: titleSimilarity(title, c.title) })).sort((a, b) => b.s - a.s)[0];
        if (oa && (!best || oa.s > best.s)) best = oa;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") throw err;
        openAlexDown = true; // still give a verdict from Crossref alone
      }
    }

    const doiIssue = badDoi ? [`DOI ${doi} doesn't exist in Crossref or DataCite — likely a typo or an invented DOI.`] : [];
    if (best && best.s >= 0.85) {
      const cmp = compare(entry, best.c);
      if (badDoi && best.c.doi) cmp.suggestions = [{ field: "doi", value: best.c.doi }, ...cmp.suggestions.filter((x) => x.field !== "doi")];
      result = {
        ...base,
        ...cmp,
        status: badDoi ? "check" : cmp.status,
        issues: [...doiIssue, ...cmp.issues],
        note: `Matched by title in ${best.c.source}.`,
      };
    } else if (best && best.s >= 0.6) {
      result = {
        ...base,
        status: "check",
        found: best.c,
        titleScore: best.s,
        issues: [...doiIssue, `Only a partial match: “${best.c.title}” (${best.c.source}). Check this is the work you mean.`],
        note: "Partial title match.",
      };
    } else {
      result = {
        ...base,
        status: "not-found",
        issues: [
          ...doiIssue,
          UNINDEXED_TYPES.has(entry.type)
            ? "Not found in Crossref or OpenAlex. Software, websites and reports often aren't indexed — confirm the source manually."
            : "No matching publication in Crossref or OpenAlex. Check that this reference exists and its title is correct.",
        ],
        note: openAlexDown ? "OpenAlex couldn't be reached, so only Crossref was searched — press Re-check to try again." : undefined,
      };
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    result = { ...base, status: "error", issues: [err instanceof Error ? err.message : "Lookup failed."] };
    return result; // don't cache transient failures
  }
  cache.set(cacheKey, result);
  return result;
}

/** Verifies many entries with limited concurrency (polite to the free APIs). */
export async function verifyAll(
  entries: BibEntry[],
  opts: { signal?: AbortSignal; onResult: (r: RefResult) => void; concurrency?: number }
): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < entries.length) {
      if (opts.signal?.aborted) return;
      const entry = entries[next++];
      try {
        opts.onResult(await verifyEntry(entry, opts.signal));
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        opts.onResult({ key: entry.key, status: "error", issues: [String(err)], suggestions: [] });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(opts.concurrency ?? 3, entries.length) }, worker));
}

// ───────────────────────────── local checks ─────────────────────────────
const REQUIRED: Record<string, string[][]> = {
  article: [["author"], ["title"], ["journal", "journaltitle"], ["year", "date"]],
  inproceedings: [["author"], ["title"], ["booktitle"], ["year", "date"]],
  conference: [["author"], ["title"], ["booktitle"], ["year", "date"]],
  book: [["author", "editor"], ["title"], ["publisher"], ["year", "date"]],
  incollection: [["author"], ["title"], ["booktitle"], ["publisher"], ["year", "date"]],
  phdthesis: [["author"], ["title"], ["school", "institution"], ["year", "date"]],
  mastersthesis: [["author"], ["title"], ["school", "institution"], ["year", "date"]],
  techreport: [["author"], ["title"], ["institution"], ["year", "date"]],
  misc: [["title"]],
  online: [["title"], ["url"]],
  software: [["title"]],
};

export interface LocalReport {
  entries: { file: string; entry: BibEntry }[];
  undefinedKeys: string[];
  unusedKeys: string[];
  duplicateKeys: string[];
  duplicateDois: { doi: string; keys: string[] }[];
  missingFields: { key: string; missing: string[] }[];
}

export function localChecks(bibFiles: { path: string; content: string }[], texSources: string[]): LocalReport {
  const entries: { file: string; entry: BibEntry }[] = [];
  const keyCount = new Map<string, number>();
  for (const f of bibFiles) {
    for (const m of f.content.matchAll(/@(?!comment|string|preamble)[A-Za-z]+\s*[{(]\s*([^,\s]+)\s*,/gi)) {
      keyCount.set(m[1], (keyCount.get(m[1]) ?? 0) + 1);
    }
    for (const entry of parseBib(f.content).values()) entries.push({ file: f.path, entry });
  }
  const defined = new Set(entries.map((e) => e.entry.key));
  const cited = new Set(texSources.flatMap((s) => citationOrder(s.replace(/(^|[^\\])%.*$/gm, "$1"))));
  cited.delete("*");

  const byDoi = new Map<string, string[]>();
  for (const { entry } of entries) {
    const d = cleanDoi(entry.fields.doi)?.toLowerCase();
    if (d) byDoi.set(d, [...(byDoi.get(d) ?? []), entry.key]);
  }

  return {
    entries,
    undefinedKeys: [...cited].filter((k) => !defined.has(k)),
    unusedKeys: [...defined].filter((k) => !cited.has(k)),
    duplicateKeys: [...keyCount].filter(([, n]) => n > 1).map(([k]) => k),
    duplicateDois: [...byDoi].filter(([, keys]) => keys.length > 1).map(([doi, keys]) => ({ doi, keys })),
    missingFields: entries
      .map(({ entry }) => ({
        key: entry.key,
        missing: (REQUIRED[entry.type] ?? []).filter((alts) => !alts.some((a) => (entry.fields[a] ?? "").trim())).map((alts) => alts.join("/")),
      }))
      .filter((x) => x.missing.length > 0),
  };
}

// ───────────────────────────── applying fixes ─────────────────────────────
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Sets (adds or replaces) one field of one entry in .bib text. Returns null if the entry isn't found. */
export function setBibField(text: string, key: string, field: string, value: string): string | null {
  const head = new RegExp(`@[A-Za-z]+\\s*([{(])\\s*${escRe(key)}\\s*,`).exec(text);
  if (!head) return null;
  const open = head[1];
  const close = open === "{" ? "}" : ")";
  let depth = 0;
  let end = -1;
  for (let i = head.index + head[0].indexOf(open); i < text.length; i++) {
    const c = text[i];
    if (c === "\\") i++;
    else if (c === "{" || c === open) depth++;
    else if ((c === "}" || c === close) && --depth === 0) {
      end = i;
      break;
    }
  }
  if (end === -1) return null;
  const bodyStart = head.index + head[0].length;
  const body = text.slice(bodyStart, end);

  const fieldMatch = new RegExp(`(^|[,\\s])(${escRe(field)})\\s*=\\s*`, "i").exec(body);
  if (fieldMatch) {
    const valueStart = bodyStart + fieldMatch.index + fieldMatch[0].length;
    const { end: valueEnd } = readValue(text, valueStart);
    // readValue skips trailing spaces; keep them
    let realEnd = valueEnd;
    while (realEnd > valueStart && /\s/.test(text[realEnd - 1])) realEnd--;
    return text.slice(0, valueStart) + `{${value}}` + text.slice(realEnd);
  }

  // Insert as a new last field, matching the entry's indentation.
  let insertAt = end;
  while (insertAt > bodyStart && /\s/.test(text[insertAt - 1])) insertAt--;
  const needsComma = text[insertAt - 1] !== ",";
  const indent = /\n([ \t]+)[A-Za-z]/.exec(body)?.[1] ?? "  ";
  return text.slice(0, insertAt) + `${needsComma ? "," : ""}\n${indent}${field} = {${value}}\n` + text.slice(end);
}
