/**
 * IBM watsonx.ai helper — server-side only (Node.js runtime)
 *
 * Provides:
 *   - IAM bearer token exchange with module-level caching (1-hour TTL, 60-second early-refresh)
 *   - generateText()     — wraps the watsonx text/generation REST endpoint
 *   - generateEmbedding() — wraps the watsonx text/embeddings REST endpoint (384-dim)
 */

const IAM_TOKEN_URL = "https://iam.cloud.ibm.com/identity/token";
const WATSONX_MODEL       = "meta-llama/llama-4-maverick-17b-128e-instruct-fp8";
const WATSONX_EMBED_MODEL = "ibm/slate-125m-english-rtrvr";

/* ── IAM token cache ──────────────────────────────────────────────────────── */

interface TokenCache {
  token: string;
  expiresAt: number; // Unix ms
}

let _cache: TokenCache | null = null;

async function getIamToken(): Promise<string> {
  const now = Date.now();
  // Re-use cached token if it has more than 60 seconds remaining
  if (_cache && _cache.expiresAt - now > 60_000) {
    return _cache.token;
  }

  const apiKey = process.env.WATSONX_API_KEY;
  if (!apiKey) throw new Error("WATSONX_API_KEY is not set");

  const res = await fetch(IAM_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ibm:params:oauth:grant-type:apikey",
      apikey: apiKey,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`IAM token exchange failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  _cache = {
    token: data.access_token,
    // IBM IAM tokens typically expire in 3600 s; use what the API reports
    expiresAt: now + data.expires_in * 1000,
  };
  return _cache.token;
}

/* ── generateText ─────────────────────────────────────────────────────────── */

interface GenerateOptions {
  maxNewTokens?: number;
  temperature?: number;
}

/**
 * Send a prompt to IBM watsonx Llama-4 Maverick and return the generated text.
 */
export async function generateText(
  prompt: string,
  options: GenerateOptions = {}
): Promise<string> {
  const { maxNewTokens = 512, temperature = 0.2 } = options;

  const watsonxUrl = process.env.WATSONX_URL ?? "https://us-south.ml.cloud.ibm.com";
  const projectId = process.env.WATSONX_PROJECT_ID;
  if (!projectId) throw new Error("WATSONX_PROJECT_ID is not set");

  const token = await getIamToken();

  const res = await fetch(
    `${watsonxUrl}/ml/v1/text/generation?version=2023-05-29`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        model_id: WATSONX_MODEL,
        input: prompt,
        parameters: {
          max_new_tokens: maxNewTokens,
          temperature,
        },
        project_id: projectId,
      }),
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`watsonx generation failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as {
    results: { generated_text: string }[];
  };

  const text = data.results?.[0]?.generated_text;
  if (typeof text !== "string") {
    throw new Error("Unexpected watsonx response shape — no generated_text");
  }
  return text.trim();
}

/* ── generateEmbedding ────────────────────────────────────────────────────── */

/**
 * Embed a text string using the IBM watsonx slate-30m model.
 * Returns a 384-dimensional float array — same dimension as all-MiniLM-L6-v2
 * used during Chroma ingestion, so existing embeddings are compatible.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const watsonxUrl = process.env.WATSONX_URL ?? "https://us-south.ml.cloud.ibm.com";
  const projectId = process.env.WATSONX_PROJECT_ID;
  if (!projectId) throw new Error("WATSONX_PROJECT_ID is not set");

  const token = await getIamToken();

  const res = await fetch(
    `${watsonxUrl}/ml/v1/text/embeddings?version=2023-05-29`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        model_id: WATSONX_EMBED_MODEL,
        inputs: [text],
        project_id: projectId,
      }),
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`watsonx embedding failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as {
    results: { embedding: number[] }[];
  };

  const embedding = data.results?.[0]?.embedding;
  if (!Array.isArray(embedding)) {
    throw new Error("Unexpected watsonx embedding response shape — no embedding array");
  }
  return embedding;
}
