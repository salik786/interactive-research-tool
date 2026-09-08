import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateText, AiConfigError } from "@/lib/ai/generate";

const SYSTEM_PROMPT = `You are helping a researcher screen a paper against a literature review's inclusion/exclusion criteria.
Given the criteria and an abstract, decide: keep, exclude, or borderline. Cite the single criterion that most drove your
decision. This is a suggestion only — the researcher makes the final call.

Respond with ONLY a JSON object: { "suggestion": "keep" | "exclude" | "borderline", "reasoning": string, "matched_criterion": string }.`;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const projectId = body?.project_id as string | undefined;
  const abstract = body?.abstract as string | undefined;
  if (!projectId || !abstract?.trim()) {
    return NextResponse.json({ error: "Missing project_id or abstract." }, { status: 400 });
  }

  const { data: membership } = await supabase
    .from("project_members")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) return NextResponse.json({ error: "Not a member of this project." }, { status: 403 });

  const { data: criteria } = await supabase
    .from("screening_criteria")
    .select("*")
    .eq("project_id", projectId)
    .order("position");

  const includes = (criteria ?? []).filter((c) => c.type === "include").map((c) => `- ${c.content}`).join("\n");
  const excludes = (criteria ?? []).filter((c) => c.type === "exclude").map((c) => `- ${c.content}`).join("\n");

  try {
    const result = await generateText({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: `Inclusion criteria:\n${includes || "(none set)"}\n\nExclusion criteria:\n${excludes || "(none set)"}\n\nAbstract:\n${abstract}`,
      maxTokens: 400,
    });

    const text = result.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "The model didn't return usable output. Try again." }, { status: 502 });
    }
    const parsed = JSON.parse(jsonMatch[0]);

    await supabase.from("ai_generations").insert({
      project_id: projectId,
      target: "screening_check",
      provider: result.provider,
      model: result.model,
      prompt_text: abstract,
      response_text: text,
      created_by: user.id,
    });

    return NextResponse.json({
      suggestion: parsed.suggestion ?? "borderline",
      reasoning: parsed.reasoning ?? "",
      matched_criterion: parsed.matched_criterion ?? "",
    });
  } catch (err) {
    if (err instanceof AiConfigError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Screening check failed." },
      { status: 500 }
    );
  }
}
