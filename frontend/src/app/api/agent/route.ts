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
Classify the following query into exactly one intent: sentinel, forecaster, or archivist.
- sentinel   = asteroids, asteroid, NEO, near-Earth objects, close approach, planetary defense, orbit, trajectory
- forecaster = solar flares, solar, space weather, CME, coronal, geomagnetic, DONKI, radiation, sun
- archivist  = research, papers, literature, studies, what does research say, how do scientists, explain, history

Important: The user may have typos, poor grammar, or use slang. Ignore spelling errors and infer the correct domain from semantic meaning. Examples: "astroid" = sentinel, "sola flair" = forecaster, "reasearch" = archivist.

If the query is completely ambiguous or unrecognisable, default to archivist.

Output only a single line of valid JSON with no extra text:
{"intent": "sentinel", "query": "the original or lightly corrected query"}

Query to classify: ${query}

JSON:`;

function stripFences(text: string): string {
  // If there's a ```json ... ``` block anywhere in the text, extract just that
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) return fenceMatch[1].trim();
  // Otherwise strip leading/trailing fences
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
      maxNewTokens: 64,
      temperature: 0,
    });

    let intent = "archivist";   // safe default
    let subQuery = query.trim();
    try {
      // Primary: strip fences and parse
      let toParse = stripFences(rawClassification);
      // Fallback: find first {...} JSON object in the raw text
      if (!toParse.startsWith("{")) {
        const jsonMatch = rawClassification.match(/\{[\s\S]*?\}/);
        if (jsonMatch) toParse = jsonMatch[0];
      }
      const parsed = JSON.parse(toParse) as {
        intent: string;
        query: string;
      };
      const parsedIntent = parsed.intent?.toLowerCase();
      // Only accept a known intent — otherwise keep the archivist default
      if (["sentinel", "forecaster", "archivist"].includes(parsedIntent)) {
        intent = parsedIntent;
      }
      subQuery = parsed.query ?? query.trim();
    } catch {
      // Model returned conversational text instead of JSON — default to archivist
      // so the system gracefully falls back to the research database instead of crashing.
      console.warn("[router] JSON parse failed, defaulting to archivist. Raw:", rawClassification.slice(0, 200));
      intent = "archivist";
      subQuery = query.trim();
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
