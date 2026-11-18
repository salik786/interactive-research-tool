/**
 * Converts a practical subset of LaTeX into a Word (.docx) document, entirely
 * client-side. This is NOT a general LaTeX engine (that would need pandoc,
 * which can't run in the browser or on Vercel). It covers what research
 * drafts overwhelmingly use: title/author/date, abstract, numbered sections,
 * text formatting, lists, \cite → [n] mapped to the bibliography, tables,
 * inline/display math (flattened to readable text), and thebibliography.
 * Anything it has to simplify is reported back as `warnings` so the user is
 * never silently handed a degraded document.
 */
import {
  AlignmentType,
  Document,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  PageBreak,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { expandBibliography } from "./bibtex";
import { extname, resolveProjectPath } from "./project-files";

/** A run inside a paragraph: text, or an embedded figure. */
type Run = TextRun | ImageRun;

type Fmt = {
  bold?: boolean;
  italics?: boolean;
  underline?: boolean;
  mono?: boolean;
  sup?: boolean;
  sub?: boolean;
};

interface Ctx {
  cites: Map<string, number>;
  warnings: Set<string>;
  counters: [number, number, number];
  orderedLists: number;
  /** Project images (png/jpg) by project path, for embedding `\includegraphics`. */
  images: Map<string, Uint8Array>;
}

type Block =
  | { t: "heading"; level: 1 | 2 | 3; text: string; numbered: boolean }
  | { t: "para"; text: string; lead?: string; indent?: boolean; align?: "center" | "left" }
  | { t: "list"; ordered: boolean; items: { term?: string; text: string }[] }
  | { t: "abstract"; paras: string[] }
  | { t: "bib"; entries: { key: string; text: string }[] }
  | { t: "math"; lines: string[] }
  | { t: "verbatim"; lines: string[] }
  | { t: "caption"; text: string }
  | { t: "table"; rows: { text: string; span: number }[][] }
  | { t: "title" }
  | { t: "pagebreak" };

// ───────────────────────────── low-level helpers ─────────────────────────────

/** Reads a balanced {…} group starting at s[i] === "{". */
function readGroup(s: string, i: number): { content: string; end: number } | null {
  if (s[i] !== "{") return null;
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (c === "\\") {
      j++; // skip escaped char (\{ \} \\ …)
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return { content: s.slice(i + 1, j), end: j + 1 };
    }
  }
  return { content: s.slice(i + 1), end: s.length };
}

function readOptional(s: string, i: number): { content: string; end: number } | null {
  if (s[i] !== "[") return null;
  const close = s.indexOf("]", i);
  if (close === -1) return null;
  return { content: s.slice(i + 1, close), end: close + 1 };
}

function skipSpaces(s: string, i: number): number {
  while (i < s.length && /[ \t\r\n]/.test(s[i])) i++;
  return i;
}

function stripComments(src: string): string {
  return src.replace(/(^|[^\\])%.*$/gm, "$1");
}

const ACCENTS: Record<string, string> = {
  "'": "́",
  "`": "̀",
  '"': "̈",
  "^": "̂",
  "~": "̃",
};

const TEXT_SYMBOLS: Record<string, string> = {
  textbackslash: "\\",
  textasciitilde: "~",
  textasciicircum: "^",
  ldots: "…",
  dots: "…",
  textellipsis: "…",
  LaTeX: "LaTeX",
  TeX: "TeX",
  textdegree: "°",
  S: "§",
  P: "¶",
  copyright: "©",
  textregistered: "®",
  texttrademark: "™",
  ss: "ß",
  o: "ø",
  O: "Ø",
  ae: "æ",
  AE: "Æ",
  oe: "œ",
  textless: "<",
  textgreater: ">",
  textbar: "|",
  textunderscore: "_",
  textpm: "±",
  texttimes: "×",
};

const MATH_SYMBOLS: Record<string, string> = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", varepsilon: "ε", zeta: "ζ",
  eta: "η", theta: "θ", vartheta: "ϑ", iota: "ι", kappa: "κ", lambda: "λ", mu: "μ", nu: "ν",
  xi: "ξ", pi: "π", rho: "ρ", sigma: "σ", tau: "τ", upsilon: "υ", phi: "φ", varphi: "φ",
  chi: "χ", psi: "ψ", omega: "ω", Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ",
  Pi: "Π", Sigma: "Σ", Phi: "Φ", Psi: "Ψ", Omega: "Ω",
  times: "×", cdot: "·", pm: "±", mp: "∓", div: "÷", leq: "≤", le: "≤", geq: "≥", ge: "≥",
  neq: "≠", ne: "≠", approx: "≈", sim: "∼", equiv: "≡", propto: "∝", infty: "∞",
  rightarrow: "→", to: "→", leftarrow: "←", leftrightarrow: "↔", Rightarrow: "⇒",
  Leftarrow: "⇐", Leftrightarrow: "⇔", sum: "∑", prod: "∏", int: "∫", partial: "∂",
  nabla: "∇", in: "∈", notin: "∉", subset: "⊂", subseteq: "⊆", cup: "∪", cap: "∩",
  forall: "∀", exists: "∃", emptyset: "∅", ldots: "…", cdots: "⋯", degree: "°", circ: "∘",
  star: "⋆", ell: "ℓ", hbar: "ħ", angle: "∠", perp: "⊥", mid: "|", ll: "≪", gg: "≫",
  langle: "⟨", rangle: "⟩", lceil: "⌈", rceil: "⌉", lfloor: "⌊", rfloor: "⌋",
};

const MATH_DROP = new Set([
  "left", "right", "big", "Big", "bigg", "Bigg", "displaystyle", "textstyle",
  "scriptstyle", "quad", "qquad", "limits", "nolimits", "label", "nonumber", "notag",
]);

/** Commands whose arguments must be consumed and discarded (no visible output). */
const DROP_ARG_COMMANDS = new Set([
  "usepackage", "setlength", "setcounter", "addtocounter", "newcommand", "renewcommand",
  "providecommand", "def", "pagestyle", "thispagestyle", "bibliographystyle", "bibliography",
  "hypersetup", "geometry", "input", "include", "label", "vspace", "hspace", "vspace*",
  "hspace*", "index", "pagenumbering", "documentclass", "graphicspath", "newtheorem",
  "numberwithin", "tableofcontents", "listoffigures", "listoftables", "linespread",
]);

function mk(text: string, f: Fmt): TextRun {
  return new TextRun({
    text,
    bold: f.bold || undefined,
    italics: f.italics || undefined,
    underline: f.underline ? {} : undefined,
    font: f.mono ? "Courier New" : undefined,
    superScript: f.sup || undefined,
    subScript: f.sub || undefined,
  });
}

function collapse(s: string): string {
  return s.replace(/[ \t\r\n]+/g, " ");
}

// ───────────────────────────── math (flattened) ─────────────────────────────

function mathRuns(src: string, fmt: Fmt, ctx: Ctx): TextRun[] {
  ctx.warnings.add("Equations are flattened to plain text (formatting simplified).");
  const runs: TextRun[] = [];
  const base: Fmt = { ...fmt, italics: true };
  let buf = "";
  const flush = (f: Fmt = base) => {
    if (buf) {
      runs.push(mk(buf, f));
      buf = "";
    }
  };

  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === "\\") {
      const m = /^\\([a-zA-Z]+)/.exec(src.slice(i));
      if (!m) {
        // \\ , \, \; \{ etc.
        const n = src[i + 1];
        if (n === "\\") buf += " ";
        else if (n === "{" || n === "}" || n === "%" || n === "$" || n === "&" || n === "#" || n === "_") buf += n;
        i += 2;
        continue;
      }
      const name = m[1];
      i += m[0].length;
      if (MATH_DROP.has(name)) continue;
      if (MATH_SYMBOLS[name]) {
        buf += MATH_SYMBOLS[name];
        continue;
      }
      if (name === "frac" || name === "dfrac" || name === "tfrac") {
        i = skipSpaces(src, i);
        const a = readGroup(src, i);
        if (!a) continue;
        const j = skipSpaces(src, a.end);
        const b = readGroup(src, j);
        flush();
        runs.push(mk("(", base), ...mathRuns(a.content, fmt, ctx), mk(")/(", base));
        if (b) {
          runs.push(...mathRuns(b.content, fmt, ctx));
          i = b.end;
        }
        runs.push(mk(")", base));
        continue;
      }
      if (name === "sqrt") {
        i = skipSpaces(src, i);
        const g = readGroup(src, i);
        flush();
        runs.push(mk("√(", base));
        if (g) {
          runs.push(...mathRuns(g.content, fmt, ctx));
          i = g.end;
        }
        runs.push(mk(")", base));
        continue;
      }
      if (["mathrm", "text", "textrm", "mathbf", "mathit", "operatorname", "mbox", "mathcal", "mathbb", "boldsymbol", "bm"].includes(name)) {
        i = skipSpaces(src, i);
        const g = readGroup(src, i);
        if (g) {
          flush();
          const f: Fmt = {
            ...fmt,
            italics: name === "mathit",
            bold: name === "mathbf" || name === "boldsymbol" || name === "bm" ? true : fmt.bold,
          };
          runs.push(...mathRuns(g.content, f, ctx).map((r) => r)); // recursion keeps its own italics default
          i = g.end;
        }
        continue;
      }
      // unknown macro: keep its argument text, drop the command
      i = skipSpaces(src, i);
      const g = readGroup(src, i);
      if (g) {
        flush();
        runs.push(...mathRuns(g.content, fmt, ctx));
        i = g.end;
      }
      continue;
    }
    if (c === "^" || c === "_") {
      flush();
      i = skipSpaces(src, i + 1);
      let inner = "";
      if (src[i] === "{") {
        const g = readGroup(src, i)!;
        inner = g.content;
        i = g.end;
      } else if (src[i] === "\\") {
        const m = /^\\([a-zA-Z]+)/.exec(src.slice(i));
        if (m) {
          inner = MATH_SYMBOLS[m[1]] ?? "";
          i += m[0].length;
        } else {
          i += 2;
        }
      } else if (i < src.length) {
        inner = src[i];
        i++;
      }
      const flat = inner.replace(/\\([a-zA-Z]+)/g, (_, n: string) => MATH_SYMBOLS[n] ?? "").replace(/[{}]/g, "");
      if (flat) runs.push(mk(flat, { ...base, sup: c === "^", sub: c === "_" }));
      continue;
    }
    if (c === "{" || c === "}") {
      i++;
      continue;
    }
    if (c === "~") {
      buf += " ";
      i++;
      continue;
    }
    buf += c;
    i++;
  }
  flush();
  return runs;
}

// ───────────────────────────── inline parsing ─────────────────────────────

const FONT_SWITCHES: Record<string, Partial<Fmt> | "ignore"> = {
  bf: { bold: true }, bfseries: { bold: true },
  it: { italics: true }, itshape: { italics: true }, em: { italics: true }, sl: { italics: true }, slshape: { italics: true },
  tt: { mono: true }, ttfamily: { mono: true },
  sc: "ignore", scshape: "ignore", rm: "ignore", rmfamily: "ignore", sf: "ignore", sffamily: "ignore",
  mdseries: "ignore", upshape: "ignore", normalfont: "ignore", small: "ignore", footnotesize: "ignore",
  scriptsize: "ignore", tiny: "ignore", large: "ignore", Large: "ignore", LARGE: "ignore",
  huge: "ignore", Huge: "ignore", normalsize: "ignore",
};

/** Pixel size of a PNG or JPEG, read from its header (no decoding). */
function imageSize(bytes: Uint8Array, type: "png" | "jpg"): { width: number; height: number } | null {
  if (type === "png") {
    if (bytes.length < 24) return null;
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: dv.getUint32(16), height: dv.getUint32(20) };
  }
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = bytes[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: (bytes[i + 5] << 8) | bytes[i + 6], width: (bytes[i + 7] << 8) | bytes[i + 8] };
    }
    i += 2 + ((bytes[i + 2] << 8) | bytes[i + 3]);
  }
  return null;
}

const MAX_IMAGE_PX = 500; // ≈ the A4 text width at 96 dpi

/** Resolves an `\includegraphics` target against uploaded project images and returns an inline picture. */
function embedImage(target: string, options: string, ctx: Ctx): ImageRun | null {
  if (ctx.images.size === 0) return null;
  const path = resolveProjectPath(target, [...ctx.images.keys()], ["png", "jpg", "jpeg"]);
  if (!path) return null;
  const ext = extname(path);
  const type = ext === "png" ? "png" : ext === "jpg" || ext === "jpeg" ? "jpg" : null;
  const data = ctx.images.get(path);
  if (!type || !data) return null;
  const size = imageSize(data, type);
  if (!size || size.width === 0 || size.height === 0) return null;

  // Honour width=0.6\linewidth / 8cm / 3in when given; otherwise fit the text width.
  let widthPx = Math.min(size.width, MAX_IMAGE_PX);
  const w = /width\s*=\s*([0-9.]+)\s*(\\(?:linewidth|textwidth|columnwidth)|cm|mm|in|pt)?/.exec(options);
  if (w) {
    const n = parseFloat(w[1]);
    const unit = w[2] ?? "";
    if (unit.startsWith("\\")) widthPx = n * MAX_IMAGE_PX;
    else if (unit === "cm") widthPx = n * 37.8;
    else if (unit === "mm") widthPx = n * 3.78;
    else if (unit === "in") widthPx = n * 96;
    else if (unit === "pt") widthPx = n * 1.333;
    widthPx = Math.min(Math.max(widthPx, 24), MAX_IMAGE_PX);
  }
  const heightPx = widthPx * (size.height / size.width);
  return new ImageRun({
    type,
    data,
    transformation: { width: Math.round(widthPx), height: Math.round(heightPx) },
    altText: { name: target, description: target, title: target },
  });
}

function inline(text: string, ctx: Ctx, fmt: Fmt = {}): Run[] {
  const runs: Run[] = [];
  let buf = "";
  const flush = () => {
    if (buf) {
      runs.push(mk(collapse(buf), fmt));
      buf = "";
    }
  };
  const withFmt = (extra: Fmt, content: string) => {
    flush();
    runs.push(...inline(content, ctx, { ...fmt, ...extra }));
  };

  let i = 0;
  while (i < text.length) {
    const c = text[i];

    if (c === "\\") {
      const next = text[i + 1];
      // control symbols
      if (next === undefined) {
        i++;
        continue;
      }
      if (!/[a-zA-Z]/.test(next)) {
        if (next === "\\") {
          flush();
          runs.push(new TextRun({ break: 1 }));
          i += 2;
          i = skipSpaces(text, i); // eat spaces after a line break
          const opt = readOptional(text, i);
          if (opt) i = opt.end;
        } else if ("&%$#_{}".includes(next)) {
          buf += next;
          i += 2;
        } else if (next === "," || next === ";" || next === ":" || next === " " || next === "@") {
          buf += " ";
          i += 2;
        } else if (next === "!" || next === "-" || next === "/") {
          i += 2;
        } else if (ACCENTS[next]) {
          // \'e  \"{o}  \^a …
          let j = i + 2;
          let letter = "";
          if (text[j] === "{") {
            const g = readGroup(text, j);
            if (g) {
              letter = g.content;
              j = g.end;
            }
          } else if (text[j]) {
            letter = text[j];
            j++;
          }
          buf += (letter + ACCENTS[next]).normalize("NFC");
          i = j;
        } else if (next === "(") {
          const close = text.indexOf("\\)", i + 2);
          const end = close === -1 ? text.length : close;
          flush();
          runs.push(...mathRuns(text.slice(i + 2, end), fmt, ctx));
          i = close === -1 ? text.length : close + 2;
        } else if (next === "[") {
          const close = text.indexOf("\\]", i + 2);
          const end = close === -1 ? text.length : close;
          flush();
          runs.push(...mathRuns(text.slice(i + 2, end), fmt, ctx));
          i = close === -1 ? text.length : close + 2;
        } else {
          i += 2;
        }
        continue;
      }

      // named command
      const m = /^[a-zA-Z]+\*?/.exec(text.slice(i + 1))!;
      const name = m[0].replace(/\*$/, "");
      let j = i + 1 + m[0].length;

      // symbols without arguments
      if (TEXT_SYMBOLS[name] !== undefined) {
        buf += TEXT_SYMBOLS[name];
        if (text[j] === "{" && text[j + 1] === "}") j += 2;
        i = j;
        continue;
      }
      if (name === "today") {
        buf += new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
        i = j;
        continue;
      }
      if (name === "newline" || name === "linebreak") {
        flush();
        runs.push(new TextRun({ break: 1 }));
        i = j;
        continue;
      }

      // font-switch declarations inside groups are handled by the group branch;
      // a bare one here (e.g. "\bfseries" at top level) is ignored.
      if (FONT_SWITCHES[name] !== undefined) {
        i = j;
        continue;
      }

      // commands taking one argument
      const argStart = skipSpaces(text, j);
      const styled: Record<string, Fmt> = {
        textbf: { bold: true },
        textit: { italics: true },
        emph: { italics: true },
        textsl: { italics: true },
        underline: { underline: true },
        uline: { underline: true },
        texttt: { mono: true },
        textsuperscript: { sup: true },
        textsubscript: { sub: true },
        textsc: {}, textrm: {}, textsf: {}, textnormal: {}, mbox: {}, hbox: {}, text: {},
        textup: {}, textmd: {}, noindent: {},
      };
      if (styled[name] !== undefined) {
        if (name === "noindent") {
          i = j;
          continue;
        }
        const g = readGroup(text, argStart);
        if (g) {
          withFmt(styled[name], g.content);
          i = g.end;
        } else {
          i = j;
        }
        continue;
      }

      if (["cite", "citep", "citet", "citeauthor", "citeyear", "parencite", "textcite", "autocite", "nocite"].includes(name)) {
        let k = argStart;
        // skip optional [pre][post]
        for (let n = 0; n < 2; n++) {
          const o = readOptional(text, k);
          if (o) k = skipSpaces(text, o.end);
        }
        const g = readGroup(text, k);
        if (g) {
          if (name !== "nocite") {
            const nums = g.content
              .split(",")
              .map((key) => key.trim())
              .filter(Boolean)
              .map((key) => (ctx.cites.has(key) ? String(ctx.cites.get(key)) : key));
            buf += `[${nums.join(", ")}]`;
          }
          i = g.end;
        } else {
          i = j;
        }
        continue;
      }

      if (["ref", "eqref", "autoref", "cref", "Cref", "pageref", "nameref"].includes(name)) {
        const g = readGroup(text, argStart);
        ctx.warnings.add("Cross-references (\\ref, \\eqref) can't be resolved and appear as “(?)”.");
        buf += "(?)";
        i = g ? g.end : j;
        continue;
      }

      if (name === "footnote" || name === "footnotetext") {
        const g = readGroup(text, argStart);
        if (g) {
          flush();
          runs.push(mk(" [", fmt), ...inline(g.content, ctx, { ...fmt, italics: true }), mk("]", fmt));
          ctx.warnings.add("Footnotes are inlined in square brackets.");
          i = g.end;
        } else i = j;
        continue;
      }

      if (name === "url") {
        const g = readGroup(text, argStart);
        buf += g ? g.content : "";
        i = g ? g.end : j;
        continue;
      }
      if (name === "href") {
        const u = readGroup(text, argStart);
        const t = u ? readGroup(text, skipSpaces(text, u.end)) : null;
        if (u && t) {
          withFmt({}, t.content);
          buf += ` (${u.content})`;
          i = t.end;
        } else i = j;
        continue;
      }

      if (name === "includegraphics") {
        let k = argStart;
        const o = readOptional(text, k);
        if (o) k = skipSpaces(text, o.end);
        const g = readGroup(text, k);
        flush();
        const image = g ? embedImage(g.content.trim(), o?.content ?? "", ctx) : null;
        if (image) {
          runs.push(image);
        } else {
          runs.push(mk(`[Image: ${g?.content ?? "figure"}]`, { ...fmt, italics: true }));
          ctx.warnings.add(
            ctx.images.size > 0
              ? "Some figures couldn't be embedded (only PNG and JPG work in Word; PDF/EPS/SVG or missing files appear as “[Image: file]”)."
              : "Images are replaced with “[Image: file]” placeholders."
          );
        }
        i = g ? g.end : j;
        continue;
      }

      if (DROP_ARG_COMMANDS.has(name)) {
        let k = j;
        for (;;) {
          k = skipSpaces(text, k);
          const o = readOptional(text, k);
          if (o) {
            k = o.end;
            continue;
          }
          const g = readGroup(text, k);
          if (g) {
            k = g.end;
            continue;
          }
          break;
        }
        i = k;
        continue;
      }

      // unknown command: keep its (single) argument's text, drop the command
      const o = readOptional(text, argStart);
      const g = readGroup(text, o ? skipSpaces(text, o.end) : argStart);
      if (g) {
        flush();
        runs.push(...inline(g.content, ctx, fmt));
        i = g.end;
      } else {
        i = j;
      }
      continue;
    }

    if (c === "$") {
      const display = text[i + 1] === "$";
      const delim = display ? "$$" : "$";
      const start = i + delim.length;
      let end = start;
      while (end < text.length) {
        if (text[end] === "\\") {
          end += 2;
          continue;
        }
        if (text.startsWith(delim, end)) break;
        end++;
      }
      flush();
      runs.push(...mathRuns(text.slice(start, end), fmt, ctx));
      i = Math.min(end + delim.length, text.length);
      continue;
    }

    if (c === "{") {
      const g = readGroup(text, i);
      if (g) {
        const sw = /^\s*\\([a-zA-Z]+)\s?/.exec(g.content);
        if (sw && FONT_SWITCHES[sw[1]] !== undefined) {
          const spec = FONT_SWITCHES[sw[1]];
          withFmt(spec === "ignore" ? {} : spec, g.content.slice(sw[0].length));
        } else {
          flush();
          runs.push(...inline(g.content, ctx, fmt));
        }
        i = g.end;
        continue;
      }
    }

    if (c === "}") {
      i++;
      continue;
    }
    if (c === "~") {
      buf += " ";
      i++;
      continue;
    }
    if (text.startsWith("---", i)) {
      buf += "—";
      i += 3;
      continue;
    }
    if (text.startsWith("--", i)) {
      buf += "–";
      i += 2;
      continue;
    }
    if (text.startsWith("``", i)) {
      buf += "“";
      i += 2;
      continue;
    }
    if (text.startsWith("''", i)) {
      buf += "”";
      i += 2;
      continue;
    }
    buf += c;
    i++;
  }
  flush();
  return runs;
}

// ───────────────────────────── block parsing ─────────────────────────────

const MATH_ENVS = new Set(["equation", "equation*", "align", "align*", "eqnarray", "eqnarray*", "gather", "gather*", "multline", "multline*", "displaymath", "math", "flalign", "flalign*"]);
const VERBATIM_ENVS = new Set(["verbatim", "verbatim*", "lstlisting", "minted"]);
const LIST_ENVS = new Set(["itemize", "enumerate", "description"]);
const TABLE_ENVS = new Set(["tabular", "tabular*", "tabularx", "longtable", "array"]);
const SKIP_LINE_COMMANDS = /^\\(label|centering|raggedright|raggedleft|bigskip|medskip|smallskip|newline|hline|toprule|midrule|bottomrule|vfill|hfill|clearpage|cleardoublepage|tableofcontents|listoffigures|listoftables|bibliographystyle|bibliography|usepackage|documentclass|setlength|setcounter|pagestyle|thispagestyle|hypersetup|geometry|input|include|newcommand|renewcommand|def|graphicspath)\b/;
const LEADING_STRIP = /^\\(noindent|centering|raggedright|raggedleft|small|large|Large|footnotesize|normalsize|bigskip|medskip|smallskip|bfseries)\b\s*/;

function escRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function captureEnv(lines: string[], start: number, name: string): { inner: string; nextLine: number } {
  const rest = lines.slice(start).join("\n");
  const startTag = `\\begin{${name}}`;
  const pos = rest.indexOf(startTag) + startTag.length;
  const re = new RegExp(`\\\\(begin|end)\\{${escRe(name)}\\}`, "g");
  re.lastIndex = pos;
  let depth = 1;
  let endIdx = rest.length;
  let endLen = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rest))) {
    if (m[1] === "begin") depth++;
    else {
      depth--;
      if (depth === 0) {
        endIdx = m.index;
        endLen = m[0].length;
        break;
      }
    }
  }
  const inner = rest.slice(pos, endIdx);
  const consumedLines = rest.slice(0, endIdx + endLen).split("\n").length;
  const tail = rest.slice(endIdx + endLen).split("\n")[0];
  if (tail.trim()) {
    // content after \end{…} on the same line: re-process it as its own line
    lines[start + consumedLines - 1] = tail;
    return { inner, nextLine: start + consumedLines - 1 };
  }
  return { inner, nextLine: start + consumedLines };
}

function parseItems(inner: string): { term?: string; text: string }[] {
  const items: { term?: string; text: string }[] = [];
  const re = /\\(begin|end)\{(?:itemize|enumerate|description)\}|\\item(?:\s*\[([^\]]*)\])?/g;
  let depth = 0;
  let last = -1;
  let current: { term?: string } = {};
  let m: RegExpExecArray | null;
  const push = (end: number) => {
    if (last >= 0) {
      let text = inner.slice(last, end).trim();
      // flatten nested lists into bullet lines
      text = text
        .replace(/\\begin\{(?:itemize|enumerate|description)\}/g, "\n")
        .replace(/\\end\{(?:itemize|enumerate|description)\}/g, "\n")
        .replace(/\\item(?:\s*\[[^\]]*\])?/g, "\n• ");
      items.push({ ...current, text });
    }
  };
  while ((m = re.exec(inner))) {
    if (m[1] === "begin") depth++;
    else if (m[1] === "end") depth--;
    else if (depth === 0) {
      push(m.index);
      current = m[2] !== undefined ? { term: m[2] } : {};
      last = m.index + m[0].length;
    }
  }
  push(inner.length);
  return items.filter((it) => it.text.trim() || it.term);
}

function parseTable(inner: string): Block | null {
  const body = inner
    .replace(/^\s*(\[[^\]]*\])?\s*(\{(?:[^{}]|\{[^{}]*\})*\})(\{(?:[^{}]|\{[^{}]*\})*\})?/, "")
    .replace(/\\(hline|toprule|midrule|bottomrule|endhead|endfirsthead|endfoot|endlastfoot)\b/g, "")
    .replace(/\\cline\{[^}]*\}/g, "")
    .replace(/\\(?:cmidrule)(?:\([^)]*\))?\{[^}]*\}/g, "");
  const rows = body
    .split(/\\\\(?:\[[^\]]*\])?/)
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) =>
      r.split(/(?<!\\)&/).map((cell) => {
        const mc = /^\s*\\multicolumn\{(\d+)\}\{[^}]*\}\{([\s\S]*)\}\s*$/.exec(cell);
        return mc ? { text: mc[2].trim(), span: parseInt(mc[1], 10) } : { text: cell.trim(), span: 1 };
      })
    );
  return rows.length ? { t: "table", rows } : null;
}

function parseBlocks(src: string, ctx: Ctx, opts: { align?: "center" | "left"; indent?: boolean } = {}): Block[] {
  const blocks: Block[] = [];
  const lines = src.split("\n");
  let para: string[] = [];
  const flushPara = () => {
    const text = para.join(" ").trim();
    if (text) blocks.push({ t: "para", text, align: opts.align, indent: opts.indent });
    para = [];
  };

  let i = 0;
  while (i < lines.length) {
    let line = lines[i].trim();
    if (!line) {
      flushPara();
      i++;
      continue;
    }

    // strip leading no-op layout commands, keep the text after them
    for (let guard = 0; guard < 5; guard++) {
      const m = LEADING_STRIP.exec(line);
      if (!m) break;
      line = line.slice(m[0].length);
    }
    if (!line) {
      i++;
      continue;
    }

    const begin = /^\\begin\{([a-zA-Z*]+)\}/.exec(line);
    if (begin) {
      flushPara();
      const name = begin[1];
      lines[i] = line;
      const { inner, nextLine } = captureEnv(lines, i, name);
      handleEnv(name, inner, blocks, ctx);
      i = nextLine;
      continue;
    }

    if (line.startsWith("\\[") || line.startsWith("$$")) {
      flushPara();
      const closer = line.startsWith("\\[") ? "\\]" : "$$";
      let text = line.slice(2);
      let k = i;
      while (!text.includes(closer) && k + 1 < lines.length) {
        k++;
        text += "\n" + lines[k];
      }
      const idx = text.indexOf(closer);
      blocks.push({ t: "math", lines: [(idx === -1 ? text : text.slice(0, idx)).trim()] });
      i = k + 1;
      continue;
    }

    const heading = /^\\(chapter|section|subsection|subsubsection|paragraph|subparagraph)(\*)?\s*(?:\[[^\]]*\])?\s*\{/.exec(line);
    if (heading) {
      flushPara();
      const braceAt = line.indexOf("{", heading[0].length - 1);
      const g = readGroup(line, braceAt);
      if (g) {
        const kind = heading[1];
        const rest = line.slice(g.end).trim();
        if (kind === "paragraph" || kind === "subparagraph") {
          blocks.push({ t: "para", lead: g.content, text: rest, align: opts.align });
          i++;
          continue;
        }
        const level = kind === "subsection" ? 2 : kind === "subsubsection" ? 3 : 1;
        blocks.push({ t: "heading", level, text: g.content, numbered: !heading[2] });
        // text after the heading on the same line is re-processed as its own line
        if (rest) lines[i] = rest;
        else i++;
        continue;
      }
    }

    if (/^\\maketitle\b/.test(line)) {
      flushPara();
      blocks.push({ t: "title" });
      i++;
      continue;
    }
    if (/^\\(newpage|pagebreak)\b/.test(line)) {
      flushPara();
      blocks.push({ t: "pagebreak" });
      i++;
      continue;
    }
    const caption = /^\\caption(?:\[[^\]]*\])?\s*\{/.exec(line);
    if (caption) {
      flushPara();
      const g = readGroup(line, line.indexOf("{", caption[0].length - 1));
      if (g) blocks.push({ t: "caption", text: g.content });
      i++;
      continue;
    }
    if (/^\\includegraphics\b/.test(line)) {
      flushPara();
      blocks.push({ t: "para", text: line, align: "center" });
      i++;
      continue;
    }
    if (/^\\item\b/.test(line)) {
      flushPara();
      blocks.push({ t: "list", ordered: false, items: [{ text: line.replace(/^\\item(\s*\[[^\]]*\])?\s*/, "") }] });
      i++;
      continue;
    }
    if (SKIP_LINE_COMMANDS.test(line)) {
      flushPara();
      i++;
      continue;
    }

    para.push(line);
    i++;
  }
  flushPara();
  return blocks;
}

function handleEnv(name: string, inner: string, blocks: Block[], ctx: Ctx): void {
  if (name === "abstract") {
    const paras = parseBlocks(inner, ctx)
      .filter((b): b is Extract<Block, { t: "para" }> => b.t === "para")
      .map((b) => b.text);
    blocks.push({ t: "abstract", paras });
  } else if (LIST_ENVS.has(name)) {
    blocks.push({ t: "list", ordered: name === "enumerate", items: parseItems(inner) });
  } else if (name === "thebibliography") {
    const body = inner.replace(/^\s*\{[^}]*\}/, "");
    const entries: { key: string; text: string }[] = [];
    const re = /\\bibitem(?:\[[^\]]*\])?\{([^}]*)\}/g;
    let m: RegExpExecArray | null;
    let prev: { key: string; start: number } | null = null;
    while ((m = re.exec(body))) {
      if (prev) entries.push({ key: prev.key, text: body.slice(prev.start, m.index).trim() });
      prev = { key: m[1].trim(), start: m.index + m[0].length };
    }
    if (prev) entries.push({ key: prev.key, text: body.slice(prev.start).trim() });
    blocks.push({ t: "bib", entries });
  } else if (MATH_ENVS.has(name)) {
    const cleaned = inner.replace(/\\label\{[^}]*\}/g, "").replace(/&/g, " ");
    const mlines = cleaned
      .split(/\\\\/)
      .map((l) => l.trim())
      .filter(Boolean);
    blocks.push({ t: "math", lines: mlines });
  } else if (VERBATIM_ENVS.has(name)) {
    blocks.push({ t: "verbatim", lines: inner.replace(/^\n/, "").replace(/\n$/, "").split("\n") });
  } else if (TABLE_ENVS.has(name)) {
    const t = parseTable(inner);
    if (t) blocks.push(t);
  } else if (name === "figure" || name === "figure*" || name === "table" || name === "table*" || name === "wrapfigure") {
    // drop the float-placement option, e.g. \begin{table}[htbp]
    blocks.push(...parseBlocks(inner.replace(/^\s*\[[^\]]*\]/, ""), ctx, { align: "center" }));
  } else if (name === "quote" || name === "quotation") {
    blocks.push(...parseBlocks(inner, ctx, { indent: true }));
  } else if (name === "center") {
    blocks.push(...parseBlocks(inner, ctx, { align: "center" }));
  } else if (name === "minipage") {
    blocks.push(...parseBlocks(inner.replace(/^\s*(\[[^\]]*\])*\s*\{[^}]*\}/, ""), ctx));
  } else {
    blocks.push(...parseBlocks(inner, ctx));
  }
}

// ───────────────────────────── document assembly ─────────────────────────────

function extractCommand(src: string, name: string): string | null {
  const re = new RegExp(`\\\\${name}\\s*(?:\\[[^\\]]*\\])?\\s*\\{`);
  const m = re.exec(src);
  if (!m) return null;
  const g = readGroup(src, m.index + m[0].length - 1);
  return g ? g.content : null;
}

export interface DocxConversion {
  doc: Document;
  warnings: string[];
}

export interface DocxOptions {
  /** Project images (path → bytes) that `\includegraphics` may embed. */
  images?: Map<string, Uint8Array>;
  /** Concatenated `.bib` text, used to build numbered references for `\bibliography{…}`. */
  bibliography?: string;
}

export function latexToDocx(source: string, options: DocxOptions = {}): DocxConversion {
  const clean = stripComments(source);
  const ctx: Ctx = {
    cites: new Map(),
    warnings: new Set(),
    counters: [0, 0, 0],
    orderedLists: 0,
    images: options.images ?? new Map(),
  };

  const preamble = clean.includes("\\begin{document}") ? clean.slice(0, clean.indexOf("\\begin{document}")) : "";
  const title = extractCommand(preamble || clean, "title");
  const author = extractCommand(preamble || clean, "author");
  const dateRaw = extractCommand(preamble || clean, "date");

  let body = clean;
  const bi = clean.indexOf("\\begin{document}");
  if (bi !== -1) {
    const ei = clean.lastIndexOf("\\end{document}");
    body = clean.slice(bi + "\\begin{document}".length, ei === -1 ? undefined : ei);
  }

  if (options.bibliography) {
    const expanded = expandBibliography(body, options.bibliography);
    body = expanded.body;
    if (expanded.missingKeys.length > 0) {
      ctx.warnings.add(`Citation key(s) not found in your .bib: ${expanded.missingKeys.slice(0, 5).join(", ")}.`);
    }
  }

  // Pre-scan bibliography so \cite{key} can resolve to its [n] number.
  {
    const re = /\\bibitem(?:\[[^\]]*\])?\{([^}]*)\}/g;
    let n = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body))) ctx.cites.set(m[1].trim(), ++n);
  }

  const blocks = parseBlocks(body, ctx);
  const children: (Paragraph | Table)[] = [];
  const numberingRefs: { reference: string }[] = [];

  for (const b of blocks) {
    switch (b.t) {
      case "title": {
        if (title) {
          children.push(
            new Paragraph({ heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, children: inline(title, ctx) })
          );
        }
        if (author) {
          const authorText = author.replace(/\s*\\and\b\s*/g, ", ").replace(/\\thanks\{[^}]*\}/g, "");
          children.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 120 },
              children: inline(authorText, ctx),
            })
          );
        }
        if (dateRaw === null || dateRaw.trim() !== "") {
          const dateText = dateRaw === null ? "\\today" : dateRaw;
          children.push(
            new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 360 }, children: inline(dateText, ctx) })
          );
        }
        break;
      }
      case "heading": {
        let prefix = "";
        if (b.numbered) {
          if (b.level === 1) ctx.counters = [ctx.counters[0] + 1, 0, 0];
          else if (b.level === 2) ctx.counters = [ctx.counters[0], ctx.counters[1] + 1, 0];
          else ctx.counters = [ctx.counters[0], ctx.counters[1], ctx.counters[2] + 1];
          prefix =
            b.level === 1
              ? `${ctx.counters[0]}  `
              : b.level === 2
                ? `${ctx.counters[0]}.${ctx.counters[1]}  `
                : `${ctx.counters[0]}.${ctx.counters[1]}.${ctx.counters[2]}  `;
        }
        children.push(
          new Paragraph({
            heading: b.level === 1 ? HeadingLevel.HEADING_1 : b.level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
            children: [...(prefix ? [mk(prefix, {})] : []), ...inline(b.text, ctx)],
          })
        );
        break;
      }
      case "para": {
        const runs: Run[] = [];
        if (b.lead) runs.push(...inline(b.lead, ctx, { bold: true }), mk(" ", {}));
        runs.push(...inline(b.text, ctx));
        children.push(
          new Paragraph({
            alignment: b.align === "center" ? AlignmentType.CENTER : AlignmentType.JUSTIFIED,
            spacing: { after: 140, line: 276 },
            indent: b.indent ? { left: 567, right: 567 } : undefined,
            children: runs,
          })
        );
        break;
      }
      case "abstract": {
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 120, after: 80 },
            children: [mk("Abstract", { bold: true })],
          })
        );
        for (const p of b.paras) {
          children.push(
            new Paragraph({
              alignment: AlignmentType.JUSTIFIED,
              spacing: { after: 140, line: 276 },
              indent: { left: 567, right: 567 },
              children: inline(p, ctx),
            })
          );
        }
        break;
      }
      case "list": {
        let reference = "bullets";
        if (b.ordered) {
          reference = `ordered-${ctx.orderedLists++}`;
          numberingRefs.push({ reference });
        }
        for (const item of b.items) {
          const lines = item.text.split("\n").filter((l) => l.trim());
          const runs: Run[] = [];
          if (item.term) runs.push(...inline(item.term, ctx, { bold: true }), mk(" ", {}));
          lines.forEach((line, idx) => {
            if (idx > 0) runs.push(new TextRun({ break: 1 }));
            runs.push(...inline(line, ctx));
          });
          children.push(
            new Paragraph({
              numbering: { reference, level: 0 },
              spacing: { after: 80 },
              children: runs,
            })
          );
        }
        break;
      }
      case "bib": {
        children.push(
          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [mk("References", {})] })
        );
        b.entries.forEach((entry, idx) => {
          children.push(
            new Paragraph({
              spacing: { after: 100 },
              indent: { left: 567, hanging: 567 },
              children: [mk(`[${idx + 1}]\t`, {}), ...inline(entry.text, ctx)],
              tabStops: [{ type: "left" as const, position: 567 }],
            })
          );
        });
        break;
      }
      case "math": {
        for (const line of b.lines) {
          children.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 80, after: 80 },
              children: mathRuns(line, {}, ctx),
            })
          );
        }
        break;
      }
      case "verbatim": {
        for (const line of b.lines) {
          children.push(new Paragraph({ spacing: { after: 0 }, children: [mk(line || " ", { mono: true })] }));
        }
        break;
      }
      case "caption": {
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 60, after: 160 },
            children: inline(b.text, ctx, { italics: true }),
          })
        );
        break;
      }
      case "table": {
        const cols = Math.max(...b.rows.map((r) => r.reduce((n, c) => n + c.span, 0)));
        children.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: b.rows.map((row) => {
              const used = row.reduce((n, c) => n + c.span, 0);
              const cells = [...row];
              if (used < cols) cells.push({ text: "", span: cols - used });
              return new TableRow({
                children: cells.map(
                  (cell) =>
                    new TableCell({
                      columnSpan: cell.span > 1 ? cell.span : undefined,
                      children: [new Paragraph({ spacing: { after: 40 }, children: inline(cell.text, ctx) })],
                    })
                ),
              });
            }),
          })
        );
        children.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
        break;
      }
      case "pagebreak":
        children.push(new Paragraph({ children: [new PageBreak()] }));
        break;
    }
  }

  if (children.length === 0) {
    children.push(new Paragraph({ children: [mk("(The LaTeX document is empty.)", { italics: true })] }));
  }

  const doc = new Document({
    creator: "Review Workbench",
    title: title ? collapse(title.replace(/\\[a-zA-Z]+/g, "").replace(/[{}]/g, "")).trim() : undefined,
    styles: {
      default: { document: { run: { font: "Times New Roman", size: 22 } } },
      paragraphStyles: [
        {
          id: "Title",
          name: "Title",
          basedOn: "Normal",
          next: "Normal",
          run: { size: 40, bold: true },
          paragraph: { alignment: AlignmentType.CENTER, spacing: { before: 120, after: 200 } },
        },
        {
          id: "Heading1",
          name: "Heading 1",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { size: 28, bold: true },
          paragraph: { spacing: { before: 320, after: 120 }, keepNext: true, outlineLevel: 0 },
        },
        {
          id: "Heading2",
          name: "Heading 2",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { size: 24, bold: true },
          paragraph: { spacing: { before: 240, after: 100 }, keepNext: true, outlineLevel: 1 },
        },
        {
          id: "Heading3",
          name: "Heading 3",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { size: 22, bold: true, italics: true },
          paragraph: { spacing: { before: 200, after: 80 }, keepNext: true, outlineLevel: 2 },
        },
      ],
    },
    numbering: {
      config: [
        {
          reference: "bullets",
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "•",
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 567, hanging: 283 } } },
            },
          ],
        },
        ...numberingRefs.map(({ reference }) => ({
          reference,
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: "%1.",
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 567, hanging: 340 } } },
            },
          ],
        })),
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 }, // A4
            margin: { top: 1418, right: 1418, bottom: 1418, left: 1418 }, // 2.5 cm
          },
        },
        children,
      },
    ],
  });

  return { doc, warnings: [...ctx.warnings] };
}

export async function latexToDocxBlob(
  source: string,
  options: DocxOptions = {}
): Promise<{ blob: Blob; warnings: string[] }> {
  const { doc, warnings } = latexToDocx(source, options);
  const blob = await Packer.toBlob(doc);
  return { blob, warnings };
}
