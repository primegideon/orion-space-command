/**
 * GitHub Models helper — server-side only (Node.js runtime)
 *
 * Wraps the GitHub Models inference endpoint (OpenAI-compatible API
 * routed through Azure: https://models.inference.ai.azure.com).
 * Authenticates with a GitHub PAT (GITHUB_TOKEN env var, models:read scope).
 *
 * Uses plain fetch — no SDK dependency required.
 * Callers should catch errors and fall through to watsonx.
 */

const GITHUB_MODELS_URL = "https://models.inference.ai.azure.com/chat/completions";
const GITHUB_MODEL = "gpt-4o";

interface GitHubModelsOptions {
  maxTokens?: number;
  temperature?: number;
}

interface OpenAIChatResponse {
  choices: {
    message: {
      content: string;
    };
  }[];
}

/**
 * Send a prompt to GPT-4o via the GitHub Models inference endpoint
 * and return the generated text.
 * Throws on missing token, network error, or unexpected response shape —
 * callers are expected to catch and fall back to watsonx.
 */
export async function generateTextGPT4o(
  prompt: string,
  options: GitHubModelsOptions = {}
): Promise<string> {
  const { maxTokens = 512, temperature = 0.3 } = options;

  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is not set");

  const res = await fetch(GITHUB_MODELS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      model: GITHUB_MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
      temperature,
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub Models API returned ${res.status}: ${body}`);
  }

  const data = (await res.json()) as OpenAIChatResponse;
  const text = data.choices?.[0]?.message?.content;

  if (typeof text !== "string" || text.trim() === "") {
    throw new Error("Unexpected GitHub Models response shape — no content in choices");
  }

  return text.trim();
}
