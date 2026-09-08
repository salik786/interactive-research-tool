export type OutlineSectionId =
  | "research_question"
  | "aim_objectives"
  | "sub_questions"
  | "pcc"
  | "scope_notes"
  | "papers_matrix"
  | "screening_criteria"
  | "prisma"
  | "themes"
  | "existing_outline";

export const OUTLINE_SECTION_META: { id: OutlineSectionId; label: string }[] = [
  { id: "research_question", label: "Research question" },
  { id: "aim_objectives", label: "Aim & objectives" },
  { id: "sub_questions", label: "Sub-research questions" },
  { id: "pcc", label: "PCC framework" },
  { id: "scope_notes", label: "Scope & boundary notes" },
  { id: "papers_matrix", label: "Papers matrix — kept papers" },
  { id: "screening_criteria", label: "Screening criteria" },
  { id: "prisma", label: "PRISMA flow numbers" },
  { id: "themes", label: "Themes + synthesis drafts" },
  { id: "existing_outline", label: "Existing outline sections already written" },
];

export const OUTLINE_TARGETS = [
  { value: "related_work", label: "Related work section" },
  { value: "intro", label: "Full introduction" },
  { value: "methods_summary", label: "Methods summary" },
  { value: "custom", label: "Custom" },
] as const;

export type OutlineTarget = (typeof OUTLINE_TARGETS)[number]["value"];
