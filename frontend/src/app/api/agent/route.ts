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
You are a query router for ORION Space Command. Route the query to one of three agents:

SENTINEL — handles live asteroid and near-Earth object data from NASA NeoWs API.
Choose sentinel when the query asks about: asteroids, NEO, near-Earth objects, close approaches, miss distance, PHO, planetary defense, asteroid size/speed/hazard, approaching objects this week.
Examples of sentinel queries:
- "show me asteroids approaching this week" → sentinel
- "are there any potentially hazardous asteroids?" → sentinel
- "what's the closest asteroid right now?" → sentinel
- "give me a planetary defense briefing" → sentinel
- "NEO close approach data" → sentinel
- "astroid" → sentinel

FORECASTER — handles live solar weather data from NASA DONKI API.
Choose forecaster when the query asks about: solar flares, space weather, CME, coronal mass ejections, X-class flares, M-class flares, solar activity, DONKI, geomagnetic storms, radiation risk, satellite risk, sun activity.
Examples of forecaster queries:
- "solar flare activity last 30 days" → forecaster
- "have there been any X-class flares recently?" → forecaster
- "what's the current space weather situation?" → forecaster
- "risk to satellites from solar activity" → forecaster
- "how active has the sun been?" → forecaster
- "sola flair" → forecaster

ARCHIVIST — handles research literature questions using a RAG knowledge base of astrophysics papers.
Choose archivist ONLY when the query explicitly asks for research findings, papers, studies, how scientists work, or technical explanations grounded in literature (not live data).
Examples of archivist queries:
- "what does research say about asteroid deflection?" → archivist
- "how do scientists predict solar flares?" → archivist
- "explain kinetic impactor deflection strategies" → archivist

Important rules:
- If the query mentions live data (this week, right now, recently, last 30 days, current, today) → prefer sentinel or forecaster over archivist.
- Ignore typos and slang — infer the correct domain from context.
- If completely ambiguous, default to archivist.

Output only a single line of valid JSON with no extra text:
{"intent": "sentinel", "query": "the original query"}

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
      maxNewTokens: 32,
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
