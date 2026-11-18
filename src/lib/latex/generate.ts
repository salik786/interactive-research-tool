/**
 * Builds a compilable starter LaTeX document from a project's own data
 * (outline sections, theme syntheses, kept papers). Pure functions only, so
 * this works identically on the server (initial template) and the client
 * (the "regenerate from project" button).
 */

// Unicode that pdfLaTeX's utf8 inputenc does NOT cover but that shows up in
// research notes constantly. Mapped to math-mode equivalents so a pasted
// "≥ 0.97" or "α = 0.05" compiles instead of failing with
// "Unicode character not set up for use with LaTeX".
const UNICODE_TO_TEX: Record<string, string> = {
  "≥": "$\\geq$",
  "≤": "$\\leq$",
  "≠": "$\\neq$",
  "≈": "$\\approx$",
  "±": "$\\pm$",
  "×": "$\\times$",
  "÷": "$\\div$",
  "→": "$\\rightarrow$",
  "←": "$\\leftarrow$",
  "↔": "$\\leftrightarrow$",
  "∞": "$\\infty$",
  "∑": "$\\sum$",
  "√": "$\\surd$",
  "µ": "$\\mu$",
  "α": "$\\alpha$",
  "β": "$\\beta$",
  "γ": "$\\gamma$",
  "δ": "$\\delta$",
  "ε": "$\\epsilon$",
  "θ": "$\\theta$",
  "λ": "$\\lambda$",
  "μ": "$\\mu$",
  "π": "$\\pi$",
  "σ": "$\\sigma$",
  "τ": "$\\tau$",
  "φ": "$\\phi$",
  "ω": "$\\omega$",
  "Δ": "$\\Delta$",
  "Σ": "$\\Sigma$",
  "Ω": "$\\Omega$",
  " ": "~", // non-breaking space
  " ": "\\,", // thin space
  "−": "$-$", // proper minus sign
};

/** Escapes plain text so it is safe to place inside a LaTeX document body. */
export function escapeLatex(input: string): string {
  let out = "";
  for (const ch of input) {
    switch (ch) {
      case "\\":
        out += "\\textbackslash{}";
        break;
      case "&":
        out += "\\&";
        break;
      case "%":
        out += "\\%";
        break;
      case "$":
        out += "\\$";
        break;
      case "#":
        out += "\\#";
        break;
      case "_":
        out += "\\_";
        break;
      case "{":
        out += "\\{";
        break;
      case "}":
        out += "\\}";
        break;
      case "~":
        out += "\\textasciitilde{}";
        break;
      case "^":
        out += "\\textasciicircum{}";
        break;
      default:
        out += UNICODE_TO_TEX[ch] ?? ch;
    }
  }
  return out;
}

/** Escapes text and preserves paragraph breaks (blank lines). */
function paragraphs(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => escapeLatex(p.trim().replace(/\n/g, " ")))
    .filter(Boolean)
    .join("\n\n");
}

export interface LatexProjectInput {
  projectName: string;
  researchQuestion: string;
  aim: string;
  sections: {
    intro: string;
    gap: string;
    approach: string;
    related_work: string;
  };
  themes: { name: string; synthesis: string; citationKeys: string[] }[];
  references: { key: string; citation: string }[];
}

const PLACEHOLDER = (what: string) => `% Write your ${what} here.`;

export function buildLatexDocument(input: LatexProjectInput): string {
  const { projectName, researchQuestion, aim, sections, themes, references } = input;
  const out: string[] = [];

  out.push(
    "\\documentclass[11pt,a4paper]{article}",
    "\\usepackage[utf8]{inputenc}",
    "\\usepackage[T1]{fontenc}",
    // Latin Modern ships as Type1 in the in-browser TeX bundle; plain T1 Computer
    // Modern would need the 60 MB cm-super font bundle and fail without it.
    "\\usepackage{lmodern}",
    "\\usepackage[margin=2.5cm]{geometry}",
    "\\usepackage{hyperref}",
    "",
    `\\title{${escapeLatex(projectName || "Untitled review")}}`,
    "\\author{Author Name}",
    "\\date{\\today}",
    "",
    "\\begin{document}",
    "\\maketitle",
    ""
  );

  if (aim.trim()) {
    out.push("\\begin{abstract}", paragraphs(aim), "\\end{abstract}", "");
  }

  // Introduction (+ research question up front)
  out.push("\\section{Introduction}");
  if (researchQuestion.trim()) {
    out.push(`\\noindent\\textbf{Research question.} ${escapeLatex(researchQuestion.trim())}`, "");
  }
  out.push(sections.intro.trim() ? paragraphs(sections.intro) : PLACEHOLDER("introduction"), "");

  out.push("\\section{Research Gap}");
  out.push(sections.gap.trim() ? paragraphs(sections.gap) : PLACEHOLDER("research gap"), "");

  out.push("\\section{Proposed Approach}");
  out.push(sections.approach.trim() ? paragraphs(sections.approach) : PLACEHOLDER("proposed approach"), "");

  out.push("\\section{Related Work}");
  const hasRelated = sections.related_work.trim().length > 0;
  if (hasRelated) out.push(paragraphs(sections.related_work), "");
  if (!hasRelated && themes.length === 0) out.push(PLACEHOLDER("related work"), "");

  for (const theme of themes) {
    out.push(`\\subsection{${escapeLatex(theme.name)}}`);
    out.push(theme.synthesis.trim() ? paragraphs(theme.synthesis) : `% No synthesis drafted for "${theme.name}" yet.`);
    if (theme.citationKeys.length > 0) {
      out.push("", `\\noindent\\textit{Studies in this theme:}~\\cite{${theme.citationKeys.join(",")}}.`);
    }
    out.push("");
  }

  if (references.length > 0) {
    out.push(`\\begin{thebibliography}{${references.length >= 10 ? "99" : "9"}}`);
    for (const ref of references) {
      out.push(`\\bibitem{${ref.key}} ${escapeLatex(ref.citation)}`);
    }
    out.push("\\end{thebibliography}", "");
  }

  out.push("\\end{document}", "");
  return out.join("\n");
}
