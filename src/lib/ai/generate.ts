import "server-only";

export type AiProviderName = "anthropic" | "openai";

export class AiConfigError extends Error {}

const ANTHROPIC_MODEL = "claude-sonnet-4-5-20250929";
const OPENAI_MODEL = "gpt-4o";

function resolveProvider(requested?: AiProviderName | null): AiProviderName {
  const provider = requested || (process.env.DEFAULT_AI_PROVIDER as AiProviderName) || "anthropic";
  if (provider === "anthropic" && !process.env.ANTHROPIC_API_KEY) {
    if (process.env.OPENAI_API_KEY) return "openai";
    throw new AiConfigError(
      "No AI provider is configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY in the server environment."
    );
  }
  if (provider === "openai" && !process.env.OPENAI_API_KEY) {
    if (process.env.ANTHROPIC_API_KEY) return "anthropic";
    throw new AiConfigError(
      "No AI provider is configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY in the server environment."
    );
  }
  return provider;
}

export function availableProviders(): AiProviderName[] {
  const list: AiProviderName[] = [];
  if (process.env.ANTHROPIC_API_KEY) list.push("anthropic");
  if (process.env.OPENAI_API_KEY) list.push("openai");
  return list;
}

interface GenerateTextArgs {
  provider?: AiProviderName | null;
  systemPrompt: string;
  userPrompt: string;
  stream?: boolean;
  maxTokens?: number;
}

export interface GenerateTextResult {
  text?: string;
  stream?: ReadableStream<Uint8Array>;
  provider: AiProviderName;
  model: string;
}

/**
 * Single entry point for all AI calls. Every /api/ai/* route calls this
 * function rather than hitting a provider SDK directly, so swapping or
 * A/B-testing providers is a one-file change.
 */
export async function generateText({
  provider: requested,
  systemPrompt,
  userPrompt,
  stream = false,
  maxTokens = 2000,
}: GenerateTextArgs): Promise<GenerateTextResult> {
  const provider = resolveProvider(requested);

  if (provider === "anthropic") {
    return generateAnthropic({ systemPrompt, userPrompt, stream, maxTokens });
  }
  return generateOpenAi({ systemPrompt, userPrompt, stream, maxTokens });
}

async function generateAnthropic({
  systemPrompt,
  userPrompt,
  stream,
  maxTokens,
}: {
  systemPrompt: string;
  userPrompt: string;
  stream: boolean;
  maxTokens: number;
}): Promise<GenerateTextResult> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      stream,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API error (${res.status}): ${body}`);
  }

  if (stream && res.body) {
    return {
      stream: transformAnthropicStream(res.body),
      provider: "anthropic",
      model: ANTHROPIC_MODEL,
    };
  }

  const json = await res.json();
  const text = (json.content ?? [])
    .filter((block: { type: string }) => block.type === "text")
    .map((block: { text: string }) => block.text)
    .join("");
  return { text, provider: "anthropic", model: ANTHROPIC_MODEL };
}

function transformAnthropicStream(body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const event = JSON.parse(data);
          if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        } catch {
          // ignore malformed SSE chunk
        }
      }
    },
  });
}

async function generateOpenAi({
  systemPrompt,
  userPrompt,
  stream,
  maxTokens,
}: {
  systemPrompt: string;
  userPrompt: string;
  stream: boolean;
  maxTokens: number;
}): Promise<GenerateTextResult> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      max_tokens: maxTokens,
      stream,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI API error (${res.status}): ${body}`);
  }

  if (stream && res.body) {
    return {
      stream: transformOpenAiStream(res.body),
      provider: "openai",
      model: OPENAI_MODEL,
    };
  }

  const json = await res.json();
  const text = json.choices?.[0]?.message?.content ?? "";
  return { text, provider: "openai", model: OPENAI_MODEL };
}

function transformOpenAiStream(body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const event = JSON.parse(data);
          const delta = event.choices?.[0]?.delta?.content;
          if (delta) controller.enqueue(encoder.encode(delta));
        } catch {
          // ignore malformed SSE chunk
        }
      }
    },
  });
}
