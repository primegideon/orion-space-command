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

/* ── Fast keyword router — runs before any LLM call ─────────────────────── */

// Hard live-data signals — user clearly wants current data right now
const SENTINEL_LIVE =
  /\b(show me|approaching|this week|right now|today|closest|fastest|biggest|largest|smallest|coming close|coming\b|miss distance|close approach|next 7 days|coming up|potentially hazardous|give me a.{0,20}briefing|are (there|any).{0,30}asteroid)\b/i;

const FORECASTER_LIVE =
  /\b(last 30 days|this month|recently|lately|current|any.{0,10}flares?|show me.{0,20}(solar|flare|donki)|give me.{0,20}solar|elevated radiation|risk to satellites|how active has the sun|solar events|what.{0,10}(solar|flare|space weather)|affect communications|radiation risk)\b/i;

// Domain topic keywords (broad — used together with intent signals)
const SENTINEL_TOPIC =
  /\b(asteroid|asteroids|neo|neos|near.?earth.{0,10}object|close.approach|miss.distance|pho|potentially.hazardous|planetary.defense|space.rock|flyby|impactor|meteor|meteorite|comet|orbital.data|space.rock)\b/i;

const FORECASTER_TOPIC =
  /\b(solar.?flare|flares?|space.weather|cme|coronal.mass|geomagnetic|donki|x.class|m.class|c.class|b.class|radiation.storm|sun.activit|solar.activit|solar.storm|solar.event|solar.wind|aurora|kp.index|sep.event|magnetogram|the sun|sunspot|heliospheric|heliophys)\b/i;

// Archivist signals — explicit research/academic framing OR "explain"/"what is"/"how does" WITHOUT live-data intent
const ARCHIVIST_STRONG =
  /\b(research|paper|papers|study|studies|literature|scientist|scientists|findings|published|methodology|theory|theories|arxiv|journal|peer.reviewed|academic|what does research|how do scientists|torino scale|hmi|cnn model|machine learning|survey completeness|debiased|readiness|detection.method|deflection.strateg|kinetic.impactor|energetic.particle|jwst|magnetogram|forecast.{0,10}model)\b/i;

const ARCHIVIST_EXPLAIN =
  /^(explain|what is|what are|how does|how do|what role|describe|define|tell me about|what exist|what mitigation|what.{0,10}strategies)\b/i;

function keywordRoute(q: string): string | null {
  const hasSentinelLive    = SENTINEL_LIVE.test(q);
  const hasForecasterLive  = FORECASTER_LIVE.test(q);
  const hasSentinelTopic   = SENTINEL_TOPIC.test(q);
  const hasForecasterTopic = FORECASTER_TOPIC.test(q);
  const hasArchivistStrong = ARCHIVIST_STRONG.test(q);
  const hasArchivistExplain = ARCHIVIST_EXPLAIN.test(q);

  // ── Rule 1: Explicit live-data intent → always live agents ──────────────
  // Forecaster live alone is sufficient (e.g. "how active has the sun been lately?" — "lately"
  // triggers FORECASTER_LIVE, no topic needed when the live phrase already implies solar)
  if (hasSentinelLive && hasSentinelTopic && !hasArchivistStrong) return "sentinel";
  if (hasForecasterLive && (hasForecasterTopic || !hasSentinelTopic) && !hasArchivistStrong) return "forecaster";
  // Sentinel live alone is sufficient when there's no competing forecaster topic
  if (hasSentinelLive && !hasForecasterTopic && !hasArchivistStrong) return "sentinel";

  // ── Rule 2: Strong archivist signal → archivist wins over domain topic ──
  // "what does research say about asteroid deflection?" — has asteroid keyword but research wins
  // "how do scientists predict solar flares?" — has flare keyword but scientists wins
  if (hasArchivistStrong) return "archivist";

  // ── Rule 3: Explain-style + NO live intent → archivist ──────────────────
  // "explain near-Earth object detection methods" (no "show me", "this week" etc.)
  // "explain CNN models for space weather prediction"
  // "what is the Torino scale?"
  if (hasArchivistExplain && !hasSentinelLive && !hasForecasterLive) return "archivist";

  // ── Rule 4: Pure topic match with no research framing → live agents ──────
  if (hasSentinelTopic && !hasForecasterTopic) return "sentinel";
  if (hasForecasterTopic && !hasSentinelTopic) return "forecaster";
  if (hasSentinelTopic && hasForecasterTopic)  return "sentinel"; // asteroid+solar → sentinel

  // Nothing matched clearly — fall through to LLM
  return null;
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

    const q = query.trim();

    // Step 1 — try fast keyword match first (no LLM call, no latency)
    let intent = keywordRoute(q);
    let subQuery = q;

    // Step 2 — only call watsonx if keywords were ambiguous
    if (!intent) {
      try {
        const rawClassification = await generateText(ROUTING_PROMPT(q), {
          maxNewTokens: 32,
          temperature: 0,
        });

        let toParse = stripFences(rawClassification);
        if (!toParse.startsWith("{")) {
          const jsonMatch = rawClassification.match(/\{[\s\S]*?\}/);
          if (jsonMatch) toParse = jsonMatch[0];
        }
        const parsed = JSON.parse(toParse) as { intent: string; query: string };
        const parsedIntent = parsed.intent?.toLowerCase();
        if (["sentinel", "forecaster", "archivist"].includes(parsedIntent)) {
          intent = parsedIntent;
        }
        subQuery = parsed.query ?? q;
      } catch {
        // LLM unavailable or returned bad JSON — keyword-scan as last resort
        console.warn("[router] LLM fallback failed, using keyword scan on raw query");
        if (ARCHIVIST_STRONG.test(q) || ARCHIVIST_EXPLAIN.test(q)) intent = "archivist";
        else if (SENTINEL_TOPIC.test(q)) intent = "sentinel";
        else if (FORECASTER_TOPIC.test(q)) intent = "forecaster";
        else intent = "sentinel";
      }
    }

    // Final safety net
    if (!intent || !["sentinel", "forecaster", "archivist"].includes(intent)) {
      intent = "sentinel";
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
