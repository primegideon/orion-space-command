/**
 * Google Gemini helper — server-side only (Node.js runtime)
 *
 * Wraps the Google AI Studio REST API for Gemini 3.5 Flash.
 * Uses plain fetch — no SDK dependency required.
 *
 * Falls back gracefully: callers should catch errors and fall through to watsonx.
 */

const GEMINI_MODEL = "gemini-3.5-flash";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

interface GeminiOptions {
  maxOutputTokens?: number;
  temperature?: number;
}

interface GeminiResponse {
  candidates: {
    content: {
      parts: { text: string }[];
    };
  }[];
}

/**
 * Send a prompt to Google Gemini 2.0 Flash and return the generated text.
 * Throws on missing key, network error, or unexpected response shape —
 * callers are expected to catch and fall back to watsonx.
 */
export async function generateTextGemini(
  prompt: string,
  options: GeminiOptions = {}
): Promise<string> {
  const { maxOutputTokens = 512, temperature = 0.3 } = options;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const url = `${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens,
        temperature,
      },
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini API returned ${res.status}: ${body}`);
  }

  const data = (await res.json()) as GeminiResponse;

  // Gemini 3.5 Flash uses thinking tokens — content.parts may be empty on short
  // maxOutputTokens budgets. Search all candidates/parts for any text.
  let text: string | undefined;
  for (const candidate of data.candidates ?? []) {
    for (const part of candidate?.content?.parts ?? []) {
      if (typeof part.text === "string" && part.text.trim().length > 0) {
        text = part.text.trim();
        break;
      }
    }
    if (text) break;
  }

  if (!text) {
    throw new Error("Gemini returned no text — model may need more output tokens");
  }

  return text;
}
