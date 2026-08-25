/**
 * Groq inference helper — server-side only (Node.js runtime)
 *
 * Wraps the Groq REST API (OpenAI-compatible).
 * Authenticates with GROQ_API_KEY env var.
 * Free tier: 30 req/min, 14,400 req/day — no credit card required.
 *
 * Uses plain fetch — no SDK dependency required.
 * Callers should catch errors and fall through to watsonx.
 */

const GROQ_URL   = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "openai/gpt-oss-120b";

interface GroqOptions {
  maxTokens?: number;
  temperature?: number;
}

interface OpenAIChatResponse {
  choices: { message: { content: string; reasoning?: string } }[];
}

export async function generateTextGroq(
  prompt: string,
  options: GroqOptions = {}
): Promise<string> {
  // gpt-oss-120b is a reasoning model — budget must be large enough that
  // reasoning tokens don't consume the entire allocation before it can reply.
  const { maxTokens = 1024, temperature = 0.3 } = options;

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not set");

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
      temperature,
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Groq API returned ${res.status}: ${body}`);
  }

  const data = (await res.json()) as OpenAIChatResponse;
  const msg  = data.choices?.[0]?.message;

  // gpt-oss-120b places its answer in `content`; when the budget is tight it
  // may only populate `reasoning` — accept either, preferring content.
  const text = msg?.content?.trim() || msg?.reasoning?.trim() || "";

  if (!text) {
    throw new Error("Unexpected Groq response shape — no content in choices");
  }

  return text;
}
