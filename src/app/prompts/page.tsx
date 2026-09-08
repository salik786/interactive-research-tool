import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ThemeToggle } from "@/components/theme-toggle";
import { PromptCard } from "./prompt-card";

const PROMPTS = [
  {
    title: "Query drafting",
    description: "Turn a research question into candidate search terms grouped by concept block.",
    prompt:
      "Given this research question and PCC framework (Population, Concept, Context), suggest 4-6 candidate search terms for each concept, including common synonyms and near-synonyms an author might use instead. Group them by concept. Do not combine them into a final boolean query — that stays a deterministic step the researcher controls.\n\nResearch question: {{research_question}}\nPopulation: {{pcc_population}}\nConcept: {{pcc_concept}}\nContext: {{pcc_context}}",
  },
  {
    title: "Screening check",
    description: "Check a paper's abstract against a project's inclusion/exclusion criteria.",
    prompt:
      "Given these inclusion and exclusion criteria for a literature review, and this paper abstract, suggest whether the paper should be kept, excluded, or flagged as borderline. Cite which specific criterion drove your suggestion. This is a suggestion only — the researcher makes the final call.\n\nInclusion criteria:\n{{include_criteria}}\n\nExclusion criteria:\n{{exclude_criteria}}\n\nAbstract:\n{{abstract}}",
  },
  {
    title: "Extraction",
    description: "Draft method/dataset/result fields from a pasted abstract for a paper matrix row.",
    prompt:
      "From this abstract, draft a short, paraphrased (not verbatim) summary of: the study's method, the dataset or sample used, and its key result. One sentence each. Also draft a one-sentence note on why this paper might be relevant to a review. This is a first draft for the researcher to edit, not a final record.\n\nAbstract:\n{{abstract}}",
  },
  {
    title: "Synthesis",
    description: "Draft a first-pass synthesis paragraph for a cluster of already-triaged papers sharing a theme.",
    prompt:
      "These papers have all been triaged into the same theme for a literature review. Write a single paragraph (120-200 words) synthesizing what they collectively show — convergences, disagreements, and gaps. Do not invent findings beyond what's implied by the notes below. This is a draft for the researcher to revise.\n\nTheme: {{theme_name}}\n\nPapers:\n{{papers_list}}",
  },
  {
    title: "Polishing prose",
    description: "Tighten a hand-written or AI-drafted paragraph without changing its claims.",
    prompt:
      "Revise this paragraph for clarity and academic tone. Do not add, remove, or alter any factual claim, citation, or number — only improve sentence structure, word choice, and flow. Keep the same approximate length.\n\nParagraph:\n{{paragraph}}",
  },
];

export default function PromptsPage() {
  return (
    <div className="min-h-screen bg-bg">
      <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-4 sm:px-8">
        <Link href="/projects" className="flex min-h-11 w-fit items-center gap-2 text-sm text-text-secondary hover:text-text-primary">
          <ArrowLeft className="h-4 w-4" /> All projects
        </Link>
        <ThemeToggle />
      </div>
      <PageHeader
        title="AI prompt library"
        description="Reference prompts used throughout the workbench — copy and adapt them for your own exploration outside the app."
      />
      <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 sm:p-8">
        {PROMPTS.map((p) => (
          <PromptCard key={p.title} {...p} />
        ))}
      </div>
    </div>
  );
}
