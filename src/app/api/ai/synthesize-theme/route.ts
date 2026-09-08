import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateText, AiConfigError } from "@/lib/ai/generate";

const SYSTEM_PROMPT = `You are helping a researcher draft a first-pass synthesis paragraph for one theme
of a literature review, from a cluster of already-triaged papers. Write a single paragraph (120-200 words)
that synthesizes what these papers collectively show about the theme — convergences, disagreements, and gaps.
Do not invent findings not implied by the given method/dataset/result notes. This is a draft the researcher
will edit, not a final statement — write in a way that's easy to revise.`;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const projectId = body?.project_id as string | undefined;
  const themeName = body?.theme_name as string | undefined;
  if (!projectId || !themeName) {
    return NextResponse.json({ error: "Missing project_id or theme_name." }, { status: 400 });
  }

  const { data: membership } = await supabase
    .from("project_members")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) return NextResponse.json({ error: "Not a member of this project." }, { status: 403 });

  const query = supabase
    .from("project_sources")
    .select("*, sources(citation)")
    .eq("project_id", projectId)
    .eq("status", "keep");

  const { data: papers } =
    themeName === "Uncategorised"
      ? await query.is("theme", null)
      : await query.eq("theme", themeName);

  if (!papers || papers.length === 0) {
    return NextResponse.json({ error: "No kept papers in this theme yet." }, { status: 400 });
  }

  const paperSummaries = papers
    .map((p, i) => {
      const citation = (p.sources as unknown as { citation: string } | null)?.citation ?? `Paper ${i + 1}`;
      return `- ${citation}: method="${p.method ?? "n/a"}", dataset="${p.dataset ?? "n/a"}", result="${p.key_result ?? "n/a"}"`;
    })
    .join("\n");

  try {
    const result = await generateText({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: `Theme: ${themeName}\n\nPapers in this theme:\n${paperSummaries}`,
      maxTokens: 500,
    });

    await supabase.from("ai_generations").insert({
      project_id: projectId,
      target: "theme_synthesis",
      provider: result.provider,
      model: result.model,
      input_sections: { theme_name: themeName, paper_count: papers.length },
      prompt_text: paperSummaries,
      response_text: result.text,
      created_by: user.id,
    });

    return NextResponse.json({ draft: result.text });
  } catch (err) {
    if (err instanceof AiConfigError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "AI synthesis failed." },
      { status: 500 }
    );
  }
}
