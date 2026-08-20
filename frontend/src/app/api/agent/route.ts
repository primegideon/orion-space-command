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
You are a query router for ORION Space Command. Route the query to exactly one of three agents.

SENTINEL — live asteroid / near-Earth object data from NASA NeoWs.
Choose sentinel for: asteroids, NEO, near-Earth objects, close approaches, miss distance, PHO, planetary defense, asteroid size/speed/hazard, space rocks, orbital data.
Examples:
- "show me asteroids approaching this week" → sentinel
- "are there any potentially hazardous asteroids?" → sentinel
- "what's the closest asteroid right now?" → sentinel
- "give me a planetary defense briefing" → sentinel
- "NEO close approach data" → sentinel
- "how big is the asteroid passing Earth?" → sentinel
- "astroid" → sentinel

FORECASTER — live solar weather data from NASA DONKI.
Choose forecaster for: solar flares, space weather, CME, coronal mass ejections, X-class/M-class flares, solar activity, geomagnetic storms, radiation risk, satellite disruption, sun activity, DONKI.
Examples:
- "solar flare activity last 30 days" → forecaster
- "have there been any X-class flares recently?" → forecaster
- "what's the current space weather situation?" → forecaster
- "risk to satellites from solar activity" → forecaster
- "how active has the sun been?" → forecaster
- "any flares today?" → forecaster
- "sola flair" → forecaster

ARCHIVIST — research literature RAG (astrophysics papers and studies).
Choose archivist ONLY when the query explicitly mentions: research, papers, studies, literature, scientists, findings, published, methodology, theories, or asks for a technical academic explanation.
Examples:
- "what does research say about asteroid deflection?" → archivist
- "how do scientists predict solar flares?" → archivist
- "explain kinetic impactor deflection strategies according to literature" → archivist

Critical routing rules:
1. Asteroid / NEO / space rock topics → ALWAYS sentinel, even if phrased as "explain" or "how".
2. Solar / flare / space weather topics → ALWAYS forecaster, even if phrased as "explain" or "how".
3. Only route to archivist when the query is clearly about research papers or scientific methodology — NOT just any general question.
4. Live-data keywords (this week, right now, recently, last 30 days, current, today, latest) → sentinel or forecaster, never archivist.
5. If truly ambiguous (topic is unclear), default to sentinel.

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
      // Model returned conversational text instead of JSON.
      // Keyword-scan the raw output and query to pick the best agent rather than always defaulting to archivist.
      console.warn("[router] JSON parse failed, keyword fallback. Raw:", rawClassification.slice(0, 200));
      const q = query.toLowerCase();
      const rawLow = rawClassification.toLowerCase();
      if (
        rawLow.includes("sentinel") ||
        /asteroid|neo|near.earth|close.approach|hazardous|planetary.defense|space.rock/.test(q)
      ) {
        intent = "sentinel";
      } else if (
        rawLow.includes("forecaster") ||
        /solar.flare|space.weather|cme|coronal|geomagnetic|donki|x.class|m.class|sun.activ/.test(q)
      ) {
        intent = "forecaster";
      } else {
        intent = "archivist";
      }
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
