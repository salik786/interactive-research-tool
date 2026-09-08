import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateText, AiConfigError } from "@/lib/ai/generate";

const SYSTEM_PROMPT = `You are helping a researcher screen a paper for a systematic literature review.
Given a pasted abstract, draft a short, paraphrased (never verbatim-copied) extraction with these fields:
- citation: a best-guess short citation string if it can be inferred, else an empty string
- method: the study's method/approach, one sentence
- dataset: the dataset or sample used, one sentence
- key_result: the key finding, one sentence
- relevance_note: one sentence on why this might matter to a review, phrased neutrally

Respond with ONLY a JSON object with exactly these keys: citation, method, dataset, key_result, relevance_note. No markdown, no commentary.`;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const abstract = body?.abstract as string | undefined;
  if (!abstract || !abstract.trim()) {
    return NextResponse.json({ error: "Paste an abstract first." }, { status: 400 });
  }

  try {
    const result = await generateText({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: `Abstract:\n\n${abstract}`,
      maxTokens: 500,
    });

    const text = result.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "The model didn't return usable output. Try again." }, { status: 502 });
    }
    const parsed = JSON.parse(jsonMatch[0]);
    return NextResponse.json({
      citation: parsed.citation ?? "",
      method: parsed.method ?? "",
      dataset: parsed.dataset ?? "",
      key_result: parsed.key_result ?? "",
      relevance_note: parsed.relevance_note ?? "",
    });
  } catch (err) {
    if (err instanceof AiConfigError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "AI extraction failed." },
      { status: 500 }
    );
  }
}
