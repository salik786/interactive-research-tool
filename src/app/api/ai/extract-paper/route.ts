import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateText, AiConfigError } from "@/lib/ai/generate";

export const runtime = "nodejs";

// Below this many characters, the given text is almost certainly just an
// abstract, not the full paper — extraction quality (esp. key_result) is
// necessarily limited, so the client surfaces that with a badge.
const ABSTRACT_ONLY_THRESHOLD = 2500;
// Cap what actually goes to the model, mainly as a sanity ceiling against a
// mis-uploaded book-length PDF — NOT a routine truncation point. Results
// sections (where the actual reported numbers live) commonly land well past
// halfway through a paper, after lengthy method/derivation sections, so a
// tight cap here silently cuts off exactly the numbers this feature exists
// to capture. gpt-4o's context window comfortably fits full papers at this
// size (roughly 25-30k tokens of input).
const MAX_CHARS_TO_MODEL = 100000;

const SYSTEM_PROMPT = `You are extracting structured metadata from a research paper's text for a literature review paper matrix. Follow these rules exactly — they exist because past extractions have fabricated details and produced useless boilerplate.

1. Never invent a citation, title, year, or author that is not explicitly present in the given text. The "citation" field must contain ONLY identifying details (author/title/year/venue/DOI) that literally appear in the text — but assemble ALL of those that are present into one citation string (e.g. "Author A, Author B et al. Title. Venue, Year. DOI: ..."), not just the single easiest-to-spot field. Title and author names are usually printed at the very start of the text (before the abstract) — check there specifically. If truly nothing citation-identifying is present anywhere, return empty string "". Do not write a sentence explaining that no citation was found — either give the real details you found or return "".

2. The "method" field must name the actual algorithm, architecture, or technique components mentioned in the text (specific model names, layers, backbones, training approach, etc.) — not a generic category description like "a deep learning approach" or "machine learning model". A method field vague enough to describe half the papers in a review matrix is a failed extraction.

3. The "key_result" field must contain the actual reported numbers (accuracy, mAP, precision, recall, F1, inference time, etc.) exactly as stated in the given text, if they appear there. Results/experiments sections are often much later in the text than the method description — read the entire given text, not just the opening sections, before concluding a metric isn't present. If specific metrics genuinely are not present anywhere in the given text, say so explicitly: "Specific metrics not stated in provided text" — do not paraphrase around the gap or invent a plausible-sounding number.

4. The "relevance_note" field must describe what the paper is about in strictly factual terms only (topic, task, domain). Do NOT include any keep/exclude opinion, screening judgment, or generic boilerplate ("this could be relevant to a review on..."). That judgment is a separate step performed elsewhere, checked against the project's actual inclusion/exclusion criteria — it does not belong here.

Respond with ONLY a JSON object with exactly these keys: citation, method, dataset, key_result, relevance_note. No markdown, no commentary.`;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let inputText: string;
  try {
    inputText = await readInputText(request);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't read the provided input." },
      { status: 400 }
    );
  }

  const trimmed = inputText.trim();
  if (!trimmed) {
    return NextResponse.json({ error: "Paste some text or upload a PDF first." }, { status: 400 });
  }

  const inputScope: "abstract" | "full_text" =
    trimmed.length < ABSTRACT_ONLY_THRESHOLD ? "abstract" : "full_text";
  const textForModel =
    trimmed.length > MAX_CHARS_TO_MODEL ? trimmed.slice(0, MAX_CHARS_TO_MODEL) : trimmed;

  try {
    const result = await generateText({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: `Source text (${inputScope === "abstract" ? "abstract or short excerpt only — full paper not provided" : "full paper text"}):\n\n${textForModel}`,
      maxTokens: 900,
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
      input_scope: inputScope,
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

/** Accepts either a JSON body `{ text }` (pasted abstract/full text) or a
 * multipart form with a `pdf` file — extracting the PDF's text server-side
 * before anything reaches the AI call. */
async function readInputText(request: Request): Promise<string> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const file = formData.get("pdf");
    if (!(file instanceof File)) {
      throw new Error("No PDF file was provided.");
    }
    if (file.type && file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      throw new Error("Please upload a PDF file.");
    }

    // pdf.js (which pdf-parse wraps) touches browser-only globals like
    // DOMMatrix for font/glyph matrix math even when only extracting text,
    // not rendering. Node doesn't have them, so a minimal polyfill is
    // required in server/serverless environments (confirmed needed on
    // Vercel's production runtime, even though local `next dev` didn't
    // surface it).
    if (typeof (globalThis as { DOMMatrix?: unknown }).DOMMatrix === "undefined") {
      const { default: DOMMatrixPolyfill } = await import("dommatrix");
      (globalThis as { DOMMatrix?: unknown }).DOMMatrix = DOMMatrixPolyfill;
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { PDFParse } = await import("pdf-parse");
    // pdf.js resolves its worker script by a relative file path at runtime.
    // Vercel's serverless bundler doesn't statically detect that dynamic
    // path, so the worker file is missing from the deployed function
    // ("Cannot find module '.../pdf.worker.mjs'") even with the package
    // marked external. Pointing it at the CDN build sidesteps local file
    // resolution entirely — safe here since the route already makes
    // outbound HTTPS calls (Supabase, the AI provider).
    PDFParse.setWorker("https://cdn.jsdelivr.net/npm/pdf-parse@2.4.5/dist/pdf-parse/web/pdf.worker.mjs");
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return result.text ?? "";
    } catch (err) {
      console.error("[extract-paper] PDF parse error:", err);
      throw new Error("Couldn't read that PDF — try pasting the text instead.");
    } finally {
      await parser.destroy();
    }
  }

  const body = await request.json().catch(() => null);
  const text = (body?.text ?? body?.abstract) as string | undefined;
  return text ?? "";
}
