import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateText, AiConfigError, type AiProviderName } from "@/lib/ai/generate";
import type { OutlineSectionId } from "@/lib/ai/outline-sections";
import type { Tables, SourceStatus } from "@/types/database";

export const runtime = "nodejs";

interface RequestBody {
  project_id: string;
  selected_sections: OutlineSectionId[];
  include_pending_papers?: boolean;
  target: string;
  custom_instructions?: string;
  provider?: AiProviderName;
}

const TARGET_INSTRUCTIONS: Record<string, string> = {
  related_work: "Draft a related-work section that synthesizes the selected material into flowing academic prose, organized by theme where themes are provided.",
  intro: "Draft a full introduction section for the review: motivate the topic, state the research question and aim, and preview the review's approach.",
  methods_summary: "Draft a concise methods summary describing the review's search and screening approach based on the provided PCC framework, criteria, and PRISMA numbers.",
  custom: "Follow the researcher's custom instructions below precisely, using only the structured material provided.",
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as RequestBody | null;
  if (!body?.project_id || !Array.isArray(body.selected_sections) || !body.target) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }
  const { project_id, selected_sections, include_pending_papers, target, custom_instructions, provider } = body;

  const { data: membership } = await supabase
    .from("project_members")
    .select("role")
    .eq("project_id", project_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) return NextResponse.json({ error: "Not a member of this project." }, { status: 403 });

  // Re-fetch everything server-side — the client is only trusted for *which*
  // sections were selected, never for the section content itself.
  const sections: string[] = [];
  const sectionSet = new Set(selected_sections);

  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", project_id)
    .single<Tables<"projects">>();

  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  if (sectionSet.has("research_question")) {
    sections.push(`## Research question\n${project.research_question || "(not set)"}`);
  }

  if (sectionSet.has("aim_objectives")) {
    const { data: objectives } = await supabase
      .from("project_objectives")
      .select("content")
      .eq("project_id", project_id)
      .order("position");
    sections.push(
      `## Aim & objectives\nAim: ${project.aim || "(not set)"}\nObjectives:\n${(objectives ?? [])
        .map((o) => `- ${o.content}`)
        .join("\n") || "(none)"}`
    );
  }

  if (sectionSet.has("sub_questions")) {
    const { data: subQs } = await supabase
      .from("project_sub_questions")
      .select("content")
      .eq("project_id", project_id)
      .order("position");
    sections.push(
      `## Sub-research questions\n${(subQs ?? []).map((q) => `- ${q.content}`).join("\n") || "(none)"}`
    );
  }

  if (sectionSet.has("pcc")) {
    sections.push(
      `## PCC framework\nPopulation: ${project.pcc_population || "(not set)"}\nConcept: ${project.pcc_concept || "(not set)"}\nContext: ${project.pcc_context || "(not set)"}`
    );
  }

  if (sectionSet.has("scope_notes")) {
    sections.push(`## Scope & boundary notes\n${project.scope_notes || "(not set)"}`);
  }

  if (sectionSet.has("papers_matrix")) {
    const statuses: SourceStatus[] = include_pending_papers ? ["keep", "pending"] : ["keep"];
    const { data: papers } = await supabase
      .from("project_sources")
      .select("*, sources(citation)")
      .eq("project_id", project_id)
      .in("status", statuses);
    const list = (papers ?? [])
      .map((p) => {
        const citation = (p.sources as unknown as { citation: string } | null)?.citation ?? "Untitled";
        return `- [${p.status}] ${citation} — theme: ${p.theme || "none"}; method: ${p.method || "n/a"}; result: ${p.key_result || "n/a"}`;
      })
      .join("\n");
    sections.push(`## Papers matrix\n${list || "(no papers)"}`);
  }

  if (sectionSet.has("screening_criteria")) {
    const { data: criteria } = await supabase
      .from("screening_criteria")
      .select("*")
      .eq("project_id", project_id)
      .order("position");
    const includes = (criteria ?? []).filter((c) => c.type === "include").map((c) => `- ${c.content}`);
    const excludes = (criteria ?? []).filter((c) => c.type === "exclude").map((c) => `- ${c.content}`);
    sections.push(
      `## Screening criteria\nInclude:\n${includes.join("\n") || "(none)"}\nExclude:\n${excludes.join("\n") || "(none)"}`
    );
  }

  if (sectionSet.has("prisma")) {
    const { data: allSources } = await supabase
      .from("project_sources")
      .select("status")
      .eq("project_id", project_id);
    const identified = project.identified_count ?? 0;
    const duplicates = project.duplicates_removed_count ?? 0;
    const screened = Math.max(identified - duplicates, 0);
    const fullText = allSources?.length ?? 0;
    const excluded = (allSources ?? []).filter((s) => s.status === "excluded").length;
    const included = (allSources ?? []).filter((s) => s.status === "keep").length;
    sections.push(
      `## PRISMA flow\nIdentified: ${identified}\nScreened: ${screened}\nFull-text assessed: ${fullText}\nExcluded at full-text: ${excluded}\nIncluded: ${included}`
    );
  }

  if (sectionSet.has("themes")) {
    const { data: kept } = await supabase
      .from("project_sources")
      .select("theme")
      .eq("project_id", project_id)
      .eq("status", "keep");
    const { data: syntheses } = await supabase
      .from("theme_synthesis")
      .select("*")
      .eq("project_id", project_id);
    const themeNames = Array.from(new Set((kept ?? []).map((k) => k.theme?.trim() || "Uncategorised")));
    const list = themeNames
      .map((name) => {
        const synthesis = (syntheses ?? []).find((s) => s.theme_name === name)?.content;
        return `### ${name}\n${synthesis || "(no synthesis drafted)"}`;
      })
      .join("\n\n");
    sections.push(`## Themes\n${list || "(no themes yet)"}`);
  }

  if (sectionSet.has("existing_outline")) {
    const { data: outline } = await supabase
      .from("outline_sections")
      .select("*")
      .eq("project_id", project_id);
    const list = (outline ?? [])
      .filter((o) => o.content.trim())
      .map((o) => `### ${o.section_key}\n${o.content}`)
      .join("\n\n");
    sections.push(`## Existing outline sections\n${list || "(none written yet)"}`);
  }

  const targetInstruction = TARGET_INSTRUCTIONS[target] ?? TARGET_INSTRUCTIONS.custom;
  const systemPrompt = `You are an academic writing assistant helping a researcher draft part of a literature review.
${targetInstruction}
Write only from the structured material provided below — do not invent citations, numbers, or findings.
Write in clear academic prose. This is a first draft the researcher will revise, not a final statement.`;

  const userPromptParts = [...sections];
  if (target === "custom" && custom_instructions) {
    userPromptParts.push(`## Custom instructions\n${custom_instructions}`);
  }
  const userPrompt = userPromptParts.join("\n\n") || "(No sections were selected — write a short placeholder noting that no context was provided.)";

  try {
    const result = await generateText({ provider, systemPrompt, userPrompt, stream: true, maxTokens: 1800 });

    if (!result.stream) {
      return NextResponse.json({ error: "Streaming is not available for this provider." }, { status: 500 });
    }

    let fullText = "";
    const supabaseForLog = supabase;
    const logStream = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        fullText += new TextDecoder().decode(chunk, { stream: true });
        controller.enqueue(chunk);
      },
      async flush() {
        await supabaseForLog.from("ai_generations").insert({
          project_id,
          target,
          provider: result.provider,
          model: result.model,
          input_sections: { selected_sections, include_pending_papers, target, custom_instructions },
          prompt_text: userPrompt,
          response_text: fullText,
          created_by: user.id,
        });
      },
    });

    const responseStream = result.stream.pipeThrough(logStream);

    return new Response(responseStream, {
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  } catch (err) {
    if (err instanceof AiConfigError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Outline generation failed." },
      { status: 500 }
    );
  }
}
