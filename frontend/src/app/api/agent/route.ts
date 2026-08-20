/**
 * /api/agent — Master Router
 *
 * 1. Receives the raw user query
 * 2. Calls IBM watsonx Llama-4 Maverick for intent classification
 * 3. Internally dispatches to the appropriate sub-agent route handler
 * 4. Returns the sub-agent's structured JSON response
 */
import { NextRequest, NextResponse } from "next/server";
import { generateText } from "@/lib/watsonx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROUTING_PROMPT = (query: string) => `\
You are an intent classifier for ORION Space Command.
Classify the user query into exactly one of: sentinel, forecaster, archivist.
- sentinel   → near-Earth objects, asteroids, NEO, NeoWs
- forecaster → solar flares, space weather, DONKI, CME
- archivist  → historical research, documents, RAG, knowledge base

Return ONLY valid JSON with no markdown fences:
{"intent": "sentinel"|"forecaster"|"archivist", "query": "<refined query>"}

User query: ${query}`;

function stripFences(text: string): string {
  return text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

export async function POST(req: NextRequest) {
  try {
    const body: unknown = await req.json();
    const query = (body as Record<string, unknown>)?.query;
    if (typeof query !== "string" || query.trim() === "") {
      return NextResponse.json(
        { intent: "error", error: "Missing or empty query", items: [], summary: "" },
        { status: 400 }
      );
    }

    // Step 1 — classify intent via watsonx
    const rawClassification = await generateText(ROUTING_PROMPT(query.trim()), {
      maxNewTokens: 128,
      temperature: 0,
    });

    let intent: string;
    let subQuery: string;
    try {
      const parsed = JSON.parse(stripFences(rawClassification)) as {
        intent: string;
        query: string;
      };
      intent = parsed.intent?.toLowerCase();
      subQuery = parsed.query ?? query.trim();
    } catch {
      return NextResponse.json(
        {
          intent: "error",
          error: `Router returned unparseable classification: ${rawClassification.slice(0, 300)}`,
          items: [],
          summary: "",
        },
        { status: 500 }
      );
    }

    if (!["sentinel", "forecaster", "archivist"].includes(intent)) {
      return NextResponse.json(
        {
          intent: "error",
          error: `Unknown intent "${intent}". Expected sentinel, forecaster, or archivist.`,
          items: [],
          summary: "",
        },
        { status: 422 }
      );
    }

    // Step 2 — forward to the relevant sub-agent by making an internal fetch
    const host = req.headers.get("host") ?? "localhost:3000";
    const protocol = host.startsWith("localhost") ? "http" : "https";
    const subAgentUrl = `${protocol}://${host}/api/agent/${intent}`;

    const subRes = await fetch(subAgentUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: subQuery }),
    });

    const subData: unknown = await subRes.json();
    return NextResponse.json({ intent, ...(subData as Record<string, unknown>) }, {
      status: subRes.ok ? 200 : subRes.status,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { intent: "error", error: message, items: [], summary: "" },
      { status: 500 }
    );
  }
}
