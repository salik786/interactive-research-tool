/**
 * Context-aware LaTeX autocomplete, fed live from the project:
 *   \cite{   → keys from every .bib file (with title/year)
 *   \ref{    → \label{…}s defined in any .tex file
 *   \includegraphics{ → uploaded figures      \input{ → .tex files
 *   \begin{  → environments (inserts the whole block)   \cmd → common commands
 */
import {
  autocompletion,
  snippet,
  snippetCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import type { Extension } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

export interface CompletionData {
  bib: { key: string; title?: string; year?: string; author?: string }[];
  labels: string[];
  images: string[];
  texFiles: string[];
  bibFiles: string[];
}

const CITE = /^(?:cite[a-zA-Z]*|[pP]arencite|[tT]extcite|[aA]utocite|[fF]ootcite|nocite|citep|citet|citealp|citealt|citeauthor|citeyear)$/;
const REF = /^(?:ref|eqref|autoref|cref|Cref|pageref|nameref|vref)$/;

const ENVIRONMENTS: [string, string][] = [
  ["figure", "figure}[htbp]\n\t\\centering\n\t\\includegraphics[width=0.8\\linewidth]{#{file}}\n\t\\caption{#{caption}}\n\t\\label{fig:#{label}}\n\\end{figure}"],
  ["table", "table}[htbp]\n\t\\centering\n\t\\caption{#{caption}}\n\t\\label{tab:#{label}}\n\t\\begin{tabular}{#{lcc}}\n\t\t\\toprule\n\t\t#{} \\\\\n\t\t\\midrule\n\t\t\\bottomrule\n\t\\end{tabular}\n\\end{table}"],
  ["equation", "equation}\n\t#{}\n\t\\label{eq:#{label}}\n\\end{equation}"],
  ["equation*", "equation*}\n\t#{}\n\\end{equation*}"],
  ["align", "align}\n\t#{} &= #{} \\\\\n\\end{align}"],
  ["align*", "align*}\n\t#{} &= #{} \\\\\n\\end{align*}"],
  ["itemize", "itemize}\n\t\\item #{}\n\\end{itemize}"],
  ["enumerate", "enumerate}\n\t\\item #{}\n\\end{enumerate}"],
  ["description", "description}\n\t\\item[#{term}] #{}\n\\end{description}"],
  ["tabular", "tabular}{#{lcc}}\n\t#{}\n\\end{tabular}"],
  ["abstract", "abstract}\n\t#{}\n\\end{abstract}"],
  ["center", "center}\n\t#{}\n\\end{center}"],
  ["quote", "quote}\n\t#{}\n\\end{quote}"],
  ["minipage", "minipage}{#{0.48}\\linewidth}\n\t#{}\n\\end{minipage}"],
  ["subfigure", "subfigure}{#{0.48}\\linewidth}\n\t\\includegraphics[width=\\linewidth]{#{file}}\n\t\\caption{#{}}\n\\end{subfigure}"],
  ["verbatim", "verbatim}\n#{}\n\\end{verbatim}"],
  ["proof", "proof}\n\t#{}\n\\end{proof}"],
];

const COMMANDS: Completion[] = [
  ...[
    ["\\section{#{}}", "\\section", "heading"],
    ["\\subsection{#{}}", "\\subsection", "heading"],
    ["\\subsubsection{#{}}", "\\subsubsection", "heading"],
    ["\\paragraph{#{}}", "\\paragraph", "heading"],
    ["\\textbf{#{}}", "\\textbf", "bold"],
    ["\\textit{#{}}", "\\textit", "italic"],
    ["\\emph{#{}}", "\\emph", "emphasis"],
    ["\\underline{#{}}", "\\underline", ""],
    ["\\texttt{#{}}", "\\texttt", "monospace"],
    ["\\cite{#{}}", "\\cite", "citation"],
    ["\\citep{#{}}", "\\citep", "natbib (Author, year)"],
    ["\\citet{#{}}", "\\citet", "natbib Author (year)"],
    ["\\ref{#{}}", "\\ref", "cross-reference"],
    ["\\eqref{#{}}", "\\eqref", "equation ref"],
    ["\\label{#{}}", "\\label", ""],
    ["\\caption{#{}}", "\\caption", ""],
    ["\\footnote{#{}}", "\\footnote", ""],
    ["\\url{#{}}", "\\url", ""],
    ["\\href{#{url}}{#{text}}", "\\href", ""],
    ["\\includegraphics[width=0.8\\linewidth]{#{}}", "\\includegraphics", "figure"],
    ["\\input{#{}}", "\\input", "include .tex"],
    ["\\include{#{}}", "\\include", ""],
    ["\\usepackage{#{}}", "\\usepackage", ""],
    ["\\bibliography{#{}}", "\\bibliography", ".bib file"],
    ["\\bibliographystyle{#{plain}}", "\\bibliographystyle", ""],
    ["\\frac{#{}}{#{}}", "\\frac", "math"],
    ["\\sqrt{#{}}", "\\sqrt", "math"],
    ["\\mathbf{#{}}", "\\mathbf", "math"],
    ["\\mathrm{#{}}", "\\mathrm", "math"],
    ["\\mathcal{#{}}", "\\mathcal", "math"],
    ["\\text{#{}}", "\\text", "math"],
    ["\\vspace{#{}}", "\\vspace", ""],
    ["\\hspace{#{}}", "\\hspace", ""],
    ["\\multicolumn{#{2}}{#{c}}{#{}}", "\\multicolumn", "table"],
  ].map(([tpl, label, detail]) => snippetCompletion(tpl, { label, detail, type: "keyword" })),
  ...[
    "\\item", "\\centering", "\\noindent", "\\maketitle", "\\tableofcontents", "\\newpage", "\\clearpage",
    "\\hline", "\\toprule", "\\midrule", "\\bottomrule", "\\linewidth", "\\textwidth", "\\today", "\\ldots",
    "\\cdot", "\\times", "\\pm", "\\leq", "\\geq", "\\neq", "\\approx", "\\infty", "\\sum", "\\int", "\\partial",
    "\\alpha", "\\beta", "\\gamma", "\\delta", "\\epsilon", "\\theta", "\\lambda", "\\mu", "\\pi", "\\sigma", "\\phi", "\\omega",
    "\\left(", "\\right)", "\\quad", "\\qquad", "\\small", "\\footnotesize", "\\large",
  ].map((label) => ({ label, type: "keyword" }) as Completion),
  { label: "\\begin", type: "keyword", detail: "environment", apply: "\\begin{" },
];

/** Applies a snippet but swallows an auto-inserted closing brace right after the cursor. */
function braceAware(template: string) {
  const run = snippet(template);
  return (view: EditorView, completion: Completion, from: number, to: number) => {
    const end = view.state.sliceDoc(to, to + 1) === "}" ? to + 1 : to;
    run(view, completion, from, end);
  };
}

export function latexCompletion(getData: () => CompletionData): Extension {
  const source = (ctx: CompletionContext): CompletionResult | null => {
    // Inside an argument: \cmd[opt]{partial  — complete the last comma-separated item.
    const arg = ctx.matchBefore(/\\([a-zA-Z]+)\*?(?:\[[^\]\n]*\])*\{([^{}\n]*)$/);
    if (arg) {
      const m = /\\([a-zA-Z]+)\*?(?:\[[^\]\n]*\])*\{([^{}\n]*)$/.exec(arg.text)!;
      const cmd = m[1];
      const inside = m[2];
      const lastSep = inside.lastIndexOf(",");
      const item = inside.slice(lastSep + 1).replace(/^\s+/, "");
      const from = ctx.pos - item.length;
      const data = getData();
      let options: Completion[] = [];

      if (CITE.test(cmd)) {
        options = data.bib.map((b) => ({
          label: b.key,
          detail: [b.author, b.year].filter(Boolean).join(", "),
          info: b.title,
          type: "text",
        }));
      } else if (REF.test(cmd)) {
        options = data.labels.map((l) => ({ label: l, type: "variable" }));
      } else if (cmd === "includegraphics") {
        options = data.images.map((p) => ({ label: p, type: "constant" }));
      } else if (cmd === "input" || cmd === "include" || cmd === "subfile") {
        options = data.texFiles.map((p) => ({ label: p.replace(/\.tex$/, ""), detail: p, type: "constant" }));
      } else if (cmd === "bibliography" || cmd === "addbibresource") {
        options = data.bibFiles.map((p) => ({ label: cmd === "bibliography" ? p.replace(/\.bib$/, "") : p, type: "constant" }));
      } else if (cmd === "begin" && lastSep === -1) {
        options = ENVIRONMENTS.map(([label, tpl]) => ({ label, type: "type", detail: "block", apply: braceAware(tpl) }));
      } else if (cmd === "end" && lastSep === -1) {
        options = ENVIRONMENTS.map(([label]) => ({ label, type: "type" }));
      } else {
        return null;
      }
      if (options.length === 0) return null;
      return { from, options, validFor: /^[^,{}\s]*$/ };
    }

    const word = ctx.matchBefore(/\\[a-zA-Z]*$/);
    if (!word || (word.from === word.to && !ctx.explicit)) return null;
    return { from: word.from, options: COMMANDS, validFor: /^\\[a-zA-Z]*$/ };
  };

  return autocompletion({ override: [source], activateOnTyping: true, icons: false, maxRenderedOptions: 60 });
}
