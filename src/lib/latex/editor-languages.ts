/**
 * Syntax modes for the LaTeX workspace: a LaTeX tokenizer that tells commands,
 * environments, section titles, citation/reference keys, math and comments
 * apart (the stock `stex` mode colours almost everything the same), and a
 * BibTeX tokenizer. Each token maps to its own highlight tag so colour themes
 * (editor-themes.ts) can style them individually.
 */
import { StreamLanguage, type StreamParser, type StringStream } from "@codemirror/language";
import { Tag, tags as t } from "@lezer/highlight";

/** Highlight tags, each derived from a standard tag so any generic theme still colours them. */
export const texTags = {
  command: Tag.define(t.keyword),
  environment: Tag.define(t.typeName),
  envKeyword: Tag.define(t.controlKeyword),
  section: Tag.define(t.heading),
  heading: Tag.define(t.heading),
  citeKey: Tag.define(t.link),
  refKey: Tag.define(t.labelName),
  fileArg: Tag.define(t.string),
  math: Tag.define(t.string),
  mathCommand: Tag.define(t.keyword),
  mathDelim: Tag.define(t.processingInstruction),
  comment: Tag.define(t.comment),
  brace: Tag.define(t.brace),
  bracket: Tag.define(t.squareBracket),
  number: Tag.define(t.number),
  special: Tag.define(t.operator),
  // BibTeX
  bibType: Tag.define(t.typeName),
  bibKey: Tag.define(t.link),
  bibField: Tag.define(t.propertyName),
  bibValue: Tag.define(t.string),
  bibComment: Tag.define(t.comment),
};

type Expect = null | "env" | "cite" | "ref" | "file" | "heading";

interface TexState {
  /** Math nesting: "$", "$$", "\\(", "\\[" or an environment name. */
  math: string | null;
  expect: Expect;
  /** Brace depth inside a section title / argument we're colouring. */
  argDepth: number;
  argKind: Expect;
  /** Inside [optional args] — keeps `expect` alive across them. */
  opt: boolean;
}

const MATH_ENVS = new Set([
  "equation", "equation*", "align", "align*", "gather", "gather*", "multline", "multline*",
  "eqnarray", "eqnarray*", "displaymath", "math", "flalign", "flalign*", "alignat", "alignat*",
]);
const CITE_CMDS = /^(?:cite[a-zA-Z]*|[pP]arencite|[tT]extcite|[aA]utocite|[fF]ootcite|nocite|citep|citet|citealp|citealt|citeauthor|citeyear)$/;
const REF_CMDS = /^(?:ref|eqref|autoref|cref|Cref|pageref|nameref|vref|label)$/;
const FILE_CMDS = /^(?:includegraphics|input|include|bibliography|addbibresource|usepackage|RequirePackage|documentclass|graphicspath|bibliographystyle)$/;
const SECTION_CMDS = /^(?:part|chapter|section|subsection|subsubsection|paragraph|subparagraph|title|caption)\*?$/;

const latexParser: StreamParser<TexState> = {
  name: "latex",
  startState: () => ({ math: null, expect: null, argDepth: 0, argKind: null, opt: false }),
  copyState: (s) => ({ ...s }),
  token(stream: StringStream, state: TexState): string | null {
    // Inside a {…} argument we are colouring as a whole (keys, env names, titles).
    if (state.argDepth > 0) {
      const ch = stream.peek();
      if (ch === "}") {
        stream.next();
        state.argDepth--;
        if (state.argDepth === 0) state.argKind = null;
        return "brace";
      }
      if (ch === "{") {
        stream.next();
        state.argDepth++;
        return "brace";
      }
      if (ch === "%") {
        stream.skipToEnd();
        return "comment";
      }
      if (ch === "\\" && state.argKind === "heading") {
        stream.next();
        if (!stream.match(/^[a-zA-Z@]+\*?/)) stream.next();
        return "command";
      }
      stream.eatWhile(state.argKind === "heading" ? /[^{}%\\]/ : /[^{}%]/);
      if (stream.current() === "") stream.next();
      switch (state.argKind) {
        case "env":
          return "environment";
        case "cite":
          return "citeKey";
        case "ref":
          return "refKey";
        case "file":
          return "fileArg";
        default:
          return "heading";
      }
    }

    if (stream.eatSpace()) return null;
    const ch = stream.peek();

    if (ch === "%") {
      stream.skipToEnd();
      return "comment";
    }

    if (ch === "\\") {
      stream.next();
      const name = stream.match(/^[a-zA-Z@]+\*?/) as RegExpMatchArray | null;
      if (!name) {
        // \\, \%, \$, \{, \(, \[ …
        const next = stream.next();
        if (next === "(" || next === "[") {
          state.math = "\\" + next;
          return "mathDelim";
        }
        if ((next === ")" && state.math === "\\(") || (next === "]" && state.math === "\\[")) {
          state.math = null;
          return "mathDelim";
        }
        return state.math ? "math" : "special";
      }
      const cmd = name[0].replace(/\*$/, "");
      if (cmd === "begin" || cmd === "end") {
        state.expect = "env";
        // Peek the env name so math environments switch math mode on/off.
        const m = stream.string.slice(stream.pos).match(/^\s*\{([^}]*)\}/);
        if (m && MATH_ENVS.has(m[1].trim())) state.math = cmd === "begin" ? m[1].trim() : null;
        return "envKeyword";
      }
      if (state.math) return "mathCommand";
      if (CITE_CMDS.test(cmd)) state.expect = "cite";
      else if (REF_CMDS.test(cmd)) state.expect = "ref";
      else if (FILE_CMDS.test(cmd)) state.expect = "file";
      else if (SECTION_CMDS.test(name[0])) {
        state.expect = "heading";
        return "section";
      }
      return "command";
    }

    if (ch === "{" ) {
      stream.next();
      state.opt = false;
      if (state.expect) {
        state.argKind = state.expect;
        state.expect = null;
        state.argDepth = 1;
      }
      return "brace";
    }
    if (ch === "}") {
      stream.next();
      return "brace";
    }
    if (ch === "[" || ch === "]") {
      stream.next();
      if (state.expect) state.opt = ch === "["; // \cite[p.~4]{key}: keep expecting the key
      return "bracket";
    }

    if (ch === "$") {
      stream.next();
      if (stream.peek() === "$") {
        stream.next();
        state.math = state.math === "$$" ? null : state.math ? state.math : "$$";
      } else {
        state.math = state.math === "$" ? null : state.math ? state.math : "$";
      }
      state.expect = null;
      return "mathDelim";
    }

    if (state.math) {
      if (stream.match(/^\d+(?:\.\d+)?/)) return "number";
      stream.eatWhile(/[^\\$%{}\d]/);
      if (stream.current() === "") stream.next();
      return "math";
    }

    if (stream.match(/^-?\d+(?:\.\d+)?(?:pt|cm|mm|in|em|ex|bp|pc|sp|\\(?:line|text|column)width)\b/)) return "number";
    if (ch === "&" || ch === "~") {
      stream.next();
      return "special";
    }

    // Plain prose: anything that doesn't start a token. Any other char breaks `expect`.
    stream.eatWhile(/[^\\%${}[\]&~\s]/);
    if (stream.current() === "") stream.next();
    if (!state.opt) state.expect = null;
    return null;
  },
  tokenTable: texTags,
  languageData: { commentTokens: { line: "%" } },
};

interface BibState {
  inEntry: boolean;
  /** Next token in an entry header is the citation key. */
  expectKey: boolean;
  /** Depth of `{…}` inside a field value (values may span lines). */
  valueDepth: number;
  /** Inside a "…" value. */
  inQuote: boolean;
}

const bibParser: StreamParser<BibState> = {
  name: "bibtex",
  startState: () => ({ inEntry: false, expectKey: false, valueDepth: 0, inQuote: false }),
  copyState: (s) => ({ ...s }),
  token(stream: StringStream, state: BibState): string | null {
    if (state.valueDepth > 0) {
      while (!stream.eol()) {
        const c = stream.next();
        if (c === "\\") stream.next();
        else if (c === "{") state.valueDepth++;
        else if (c === "}" && --state.valueDepth === 0) break;
      }
      return "bibValue";
    }
    if (state.inQuote) {
      while (!stream.eol()) {
        const c = stream.next();
        if (c === "\\") stream.next();
        else if (c === '"') {
          state.inQuote = false;
          break;
        }
      }
      return "bibValue";
    }
    if (stream.eatSpace()) return null;

    if (!state.inEntry) {
      if (stream.match(/^@[A-Za-z]+/)) {
        state.inEntry = true;
        state.expectKey = true;
        return "bibType";
      }
      // BibTeX ignores everything outside entries — it's effectively a comment.
      if (!stream.skipTo("@")) stream.skipToEnd();
      return "bibComment";
    }

    const ch = stream.peek();
    if (ch === "{" || ch === "(") {
      stream.next();
      return "brace";
    }
    if (state.expectKey) {
      if (stream.match(/^[^,\s{}()]+/)) {
        state.expectKey = false;
        return "bibKey";
      }
    }
    if (ch === "}" || ch === ")") {
      stream.next();
      state.inEntry = false;
      return "brace";
    }
    if (ch === "%") {
      stream.skipToEnd();
      return "bibComment";
    }
    if (stream.match(/^[A-Za-z][\w-]*(?=\s*=)/)) return "bibField";
    if (ch === "=" || ch === "#" || ch === ",") {
      stream.next();
      return "special";
    }
    if (ch === '"') {
      stream.next();
      state.inQuote = true;
      return "bibValue";
    }
    if (stream.match(/^\d+/)) return "number";
    stream.next();
    return "bibValue";
  },
  tokenTable: texTags,
  languageData: { commentTokens: { line: "%" } },
};

export const latexLanguage = StreamLanguage.define(latexParser);
export const bibtexLanguage = StreamLanguage.define(bibParser);
