/**
 * Editor preferences (per browser) and the CodeMirror extensions they produce:
 * colour themes for the LaTeX/BibTeX token types, font, spacing, wrapping,
 * spellcheck, tab size.
 */
import { HighlightStyle, syntaxHighlighting, indentUnit } from "@codemirror/language";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { texTags as k } from "./editor-languages";

export type ThemeId = "auto" | "classic" | "solarized" | "contrast" | "one-dark" | "dracula" | "nord";
export type FontId = "mono" | "sans" | "serif";

export interface EditorSettings {
  theme: ThemeId;
  fontSize: number;
  fontFamily: FontId;
  lineHeight: number;
  wrap: boolean;
  lineNumbers: boolean;
  activeLine: boolean;
  autocomplete: boolean;
  closeBrackets: boolean;
  spellcheck: boolean;
  tabSize: 2 | 4;
  autoCompile: boolean;
}

export const DEFAULT_SETTINGS: EditorSettings = {
  theme: "auto",
  fontSize: 14,
  fontFamily: "mono",
  lineHeight: 1.6,
  wrap: true,
  lineNumbers: true,
  activeLine: true,
  autocomplete: true,
  closeBrackets: true,
  spellcheck: false,
  tabSize: 2,
  autoCompile: false,
};

const STORAGE_KEY = "latex-editor-settings";

export function loadSettings(): EditorSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<EditorSettings>) : {};
    const merged = { ...DEFAULT_SETTINGS, ...parsed };
    merged.fontSize = Math.min(24, Math.max(11, Number(merged.fontSize) || 14));
    return merged;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: EditorSettings) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* a preference only — fine if storage is blocked */
  }
}

interface Palette {
  label: string;
  dark: boolean;
  bg: string;
  fg: string;
  gutterFg: string;
  activeLine: string;
  selection: string;
  cursor: string;
  command: string;
  environment: string;
  section: string;
  heading: string;
  cite: string;
  ref: string;
  file: string;
  math: string;
  mathDelim: string;
  comment: string;
  brace: string;
  number: string;
  special: string;
  bibField: string;
  bibValue: string;
}

export const THEMES: Record<Exclude<ThemeId, "auto">, Palette> = {
  classic: {
    label: "Classic (light)", dark: false, bg: "#ffffff", fg: "#1f2328", gutterFg: "#8c959f", activeLine: "#f6f8fa", selection: "#b6d7ff", cursor: "#1f2328",
    command: "#0550ae", environment: "#8250df", section: "#953800", heading: "#1f2328", cite: "#116329", ref: "#9a6700", file: "#0a3069",
    math: "#0e7490", mathDelim: "#cf222e", comment: "#6e7781", brace: "#57606a", number: "#0550ae", special: "#cf222e", bibField: "#0550ae", bibValue: "#0a3069",
  },
  solarized: {
    label: "Solarized (light)", dark: false, bg: "#fdf6e3", fg: "#586e75", gutterFg: "#93a1a1", activeLine: "#eee8d5", selection: "#e3dcc4", cursor: "#586e75",
    command: "#268bd2", environment: "#6c71c4", section: "#cb4b16", heading: "#073642", cite: "#859900", ref: "#b58900", file: "#2aa198",
    math: "#2aa198", mathDelim: "#dc322f", comment: "#93a1a1", brace: "#657b83", number: "#d33682", special: "#dc322f", bibField: "#268bd2", bibValue: "#2aa198",
  },
  contrast: {
    label: "High contrast (light)", dark: false, bg: "#ffffff", fg: "#000000", gutterFg: "#444444", activeLine: "#f0f0f0", selection: "#a8cfff", cursor: "#000000",
    command: "#0000cc", environment: "#6a00a8", section: "#a10000", heading: "#000000", cite: "#006400", ref: "#8b4500", file: "#00008b",
    math: "#005f5f", mathDelim: "#b00000", comment: "#505050", brace: "#000000", number: "#0000cc", special: "#b00000", bibField: "#0000cc", bibValue: "#00008b",
  },
  "one-dark": {
    label: "One Dark", dark: true, bg: "#282c34", fg: "#abb2bf", gutterFg: "#5c6370", activeLine: "#2c313a", selection: "#3e4451", cursor: "#528bff",
    command: "#61afef", environment: "#c678dd", section: "#e06c75", heading: "#e5c07b", cite: "#98c379", ref: "#d19a66", file: "#56b6c2",
    math: "#56b6c2", mathDelim: "#e06c75", comment: "#7f848e", brace: "#abb2bf", number: "#d19a66", special: "#e06c75", bibField: "#61afef", bibValue: "#98c379",
  },
  dracula: {
    label: "Dracula", dark: true, bg: "#282a36", fg: "#f8f8f2", gutterFg: "#6272a4", activeLine: "#313442", selection: "#44475a", cursor: "#f8f8f2",
    command: "#ff79c6", environment: "#bd93f9", section: "#ff79c6", heading: "#f1fa8c", cite: "#50fa7b", ref: "#ffb86c", file: "#f1fa8c",
    math: "#8be9fd", mathDelim: "#ff5555", comment: "#6272a4", brace: "#f8f8f2", number: "#bd93f9", special: "#ff5555", bibField: "#8be9fd", bibValue: "#f1fa8c",
  },
  nord: {
    label: "Nord", dark: true, bg: "#2e3440", fg: "#d8dee9", gutterFg: "#616e88", activeLine: "#3b4252", selection: "#434c5e", cursor: "#d8dee9",
    command: "#81a1c1", environment: "#b48ead", section: "#88c0d0", heading: "#eceff4", cite: "#a3be8c", ref: "#ebcb8b", file: "#8fbcbb",
    math: "#8fbcbb", mathDelim: "#bf616a", comment: "#616e88", brace: "#d8dee9", number: "#b48ead", special: "#bf616a", bibField: "#81a1c1", bibValue: "#a3be8c",
  },
};

export function resolveTheme(id: ThemeId, appIsDark: boolean): Palette {
  if (id === "auto") return appIsDark ? THEMES["one-dark"] : THEMES.classic;
  return THEMES[id];
}

const FONTS: Record<FontId, string> = {
  mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
  sans: "var(--font-sans)",
  serif: "var(--font-serif)",
};

export const FONT_LABELS: Record<FontId, string> = {
  mono: "Monospace (code)",
  sans: "Sans-serif (Inter)",
  serif: "Serif (Source Serif — for prose)",
};

/** Colours + typography + behaviour derived from the settings. */
export function settingsExtensions(s: EditorSettings, appIsDark: boolean): Extension[] {
  const p = resolveTheme(s.theme, appIsDark);
  const theme = EditorView.theme(
    {
      "&": { backgroundColor: p.bg, color: p.fg, fontSize: `${s.fontSize}px`, height: "100%" },
      ".cm-scroller": { fontFamily: FONTS[s.fontFamily], lineHeight: String(s.lineHeight) },
      ".cm-content": { caretColor: p.cursor },
      ".cm-cursor, .cm-dropCursor": { borderLeftColor: p.cursor },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": { backgroundColor: `${p.selection} !important` },
      ".cm-activeLine": { backgroundColor: s.activeLine ? p.activeLine : "transparent" },
      ".cm-gutters": { backgroundColor: p.bg, color: p.gutterFg, borderRight: `1px solid ${p.activeLine}` },
      ".cm-activeLineGutter": { backgroundColor: s.activeLine ? p.activeLine : "transparent" },
      ".cm-matchingBracket": { backgroundColor: p.selection, outline: `1px solid ${p.gutterFg}` },
      ".cm-tooltip": { backgroundColor: p.bg, color: p.fg, border: `1px solid ${p.selection}` },
      ".cm-tooltip-autocomplete > ul > li[aria-selected]": { backgroundColor: p.selection, color: p.fg },
      ".cm-completionDetail": { color: p.gutterFg, fontStyle: "normal", marginLeft: "0.75em" },
    },
    { dark: p.dark }
  );
  const highlight = HighlightStyle.define([
    { tag: k.command, color: p.command },
    { tag: k.environment, color: p.environment, fontWeight: "600" },
    { tag: k.envKeyword, color: p.environment },
    { tag: k.section, color: p.section, fontWeight: "600" },
    { tag: k.heading, color: p.heading, fontWeight: "700" },
    { tag: k.citeKey, color: p.cite },
    { tag: k.refKey, color: p.ref },
    { tag: k.fileArg, color: p.file },
    { tag: k.math, color: p.math },
    { tag: k.mathCommand, color: p.math, fontWeight: "600" },
    { tag: k.mathDelim, color: p.mathDelim, fontWeight: "600" },
    { tag: k.comment, color: p.comment, fontStyle: "italic" },
    { tag: k.brace, color: p.brace },
    { tag: k.bracket, color: p.brace },
    { tag: k.number, color: p.number },
    { tag: k.special, color: p.special },
    { tag: k.bibType, color: p.environment, fontWeight: "700" },
    { tag: k.bibKey, color: p.cite, fontWeight: "600" },
    { tag: k.bibField, color: p.bibField },
    { tag: k.bibValue, color: p.bibValue },
    { tag: k.bibComment, color: p.comment, fontStyle: "italic" },
  ]);
  return [
    theme,
    syntaxHighlighting(highlight),
    EditorState.tabSize.of(s.tabSize),
    indentUnit.of(" ".repeat(s.tabSize)),
    ...(s.wrap ? [EditorView.lineWrapping] : []),
    EditorView.contentAttributes.of({ spellcheck: s.spellcheck ? "true" : "false", autocorrect: "off", autocapitalize: "off" }),
  ];
}

/** A short sample shown in the settings dialog's live preview. */
export const PREVIEW_SAMPLE = String.raw`\section{Results}\label{sec:results}
% Accuracy on the held-out tomato set
Our detector reaches $F_1 = 0.94$ (Table~\ref{tab:main}),
outperforming YOLOv8~\cite{redmon2016yolo, jocher2023}.
\begin{figure}[htbp]
  \includegraphics[width=0.8\linewidth]{figures/pipeline}
\end{figure}`;
