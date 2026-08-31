/**
 * /api/agent/sentinel — Near-Earth Objects Sub-Agent
 *
 * 1. Fetches NASA NeoWs feed for a 7-day window
 * 2. Flattens the response into AsteroidItem[]
 * 3. Calls IBM watsonx for a natural-language summary
 * 4. Returns SentinelData JSON (identical contract to V1)
 */
import { NextRequest, NextResponse } from "next/server";
import { generateText } from "@/lib/watsonx";
import { generateTextGemini } from "@/lib/gemini";
import type { SentinelData, AsteroidItem } from "@/components/SentinelPanel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* ── NASA NeoWs types (partial) ──────────────────────────────────────────── */
interface NeoEstimatedDiameter {
  kilometers: { estimated_diameter_max: number };
}
interface NeoCloseApproach {
  close_approach_date: string;
  miss_distance: { kilometers: string };
  relative_velocity: { kilometers_per_hour: string };
}
interface NeoObject {
  id: string;              // NASA SPK-ID (e.g. "2465633")
  name: string;
  is_potentially_hazardous_asteroid: boolean;
  estimated_diameter: NeoEstimatedDiameter;
  close_approach_data: NeoCloseApproach[];
}
interface NeoWsFeed {
  near_earth_objects: Record<string, NeoObject[]>;
}

/* ── helpers ─────────────────────────────────────────────────────────────── */
function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function flattenNeo(feed: NeoWsFeed): AsteroidItem[] {
  const items: AsteroidItem[] = [];
  for (const [, neos] of Object.entries(feed.near_earth_objects)) {
    for (const neo of neos) {
      const ca = neo.close_approach_data?.[0];
      items.push({
        name: neo.name,
        nasa_id: neo.id,
        miss_distance_km: ca
          ? Math.round(parseFloat(ca.miss_distance.kilometers))
          : null,
        estimated_diameter_km_max:
          neo.estimated_diameter?.kilometers?.estimated_diameter_max ?? null,
        is_potentially_hazardous: neo.is_potentially_hazardous_asteroid,
        relative_velocity_kmh: ca
          ? Math.round(parseFloat(ca.relative_velocity.kilometers_per_hour))
          : null,
        close_approach_date: ca?.close_approach_date ?? "unknown",
      });
    }
  }
  // Sort by close approach date ascending
  items.sort((a, b) => a.close_approach_date.localeCompare(b.close_approach_date));
  return items;
}

function buildSentinelPrompt(items: AsteroidItem[], dateRange: { start: string; end: string }): string {
  // Pre-compute key facts so the model doesn't have to derive them (fixes S4)
  const phoList = items.filter(a => a.is_potentially_hazardous);
  const closest = items.reduce<AsteroidItem | null>((best, a) => {
    if (a.miss_distance_km === null) return best;
    if (best === null || best.miss_distance_km === null) return a;
    return a.miss_distance_km < best.miss_distance_km ? a : best;
  }, null);
  const largest = items.reduce<AsteroidItem | null>((best, a) => {
    if (a.estimated_diameter_km_max === null) return best;
    if (best === null || best.estimated_diameter_km_max === null) return a;
    return a.estimated_diameter_km_max > best.estimated_diameter_km_max ? a : best;
  }, null);

  const facts = [
    `Tracking window: ${dateRange.start} to ${dateRange.end}`,
    `Total objects detected: ${items.length}`,
    `Potentially hazardous (PHO): ${phoList.length}${phoList.length > 0 ? ` — ${phoList.map(a => a.name).join(", ")}` : ""}`,
    closest ? `Closest approach: ${closest.name} at ${closest.miss_distance_km?.toLocaleString()} km on ${closest.close_approach_date}` : "Closest approach: none",
    largest ? `Largest object: ${largest.name} (≤${largest.estimated_diameter_km_max?.toFixed(3)} km diameter)` : "",
  ].filter(Boolean).join("\n");

  const objectList = items.slice(0, 20).map(a =>
    `${a.name}: ${a.miss_distance_km?.toLocaleString() ?? "?"} km on ${a.close_approach_date}, ` +
    `diameter ≤${a.estimated_diameter_km_max?.toFixed(3) ?? "?"} km, ` +
    `${a.relative_velocity_kmh?.toLocaleString() ?? "?"} km/h` +
    (a.is_potentially_hazardous ? " [PHO]" : "")
  ).join("\n");

  // Fix S1: no satellite reference. Fix S2: imperative not template-style.
  return `You are SENTINEL, the near-Earth object monitoring agent for ORION Space Command.

PRE-COMPUTED FACTS (use these numbers exactly — do not recalculate):
${facts}

FULL OBJECT LIST:
${objectList}

Write a 2–3 sentence mission briefing for the ORION operator. State how many near-Earth objects are being tracked this week, name the closest approach object and its exact miss distance, and flag any PHO designations by name. Be factual, direct, and precise — use the pre-computed numbers above verbatim.

OUTPUT RULES: Plain prose paragraph only. No headings. No bullet points. No asterisks. No markdown. No JSON. No numbered lists. No reasoning steps. No preamble. Do not start with "Here is" or "Drafting" or any meta-commentary. Start directly with the briefing content.`;
}

/* ── output sanitiser ────────────────────────────────────────────────────── */
function cleanSummary(raw: string): string {
  let text = raw;

  // Fix S5: strip Gemini preamble patterns before any other processing
  const preamblePatterns = [
    /^drafting\s+the\s+briefing[^:\n]*:?\s*/im,
    /^here\s+is\s+the\s+(?:mission\s+)?briefing[^:\n]*:?\s*/im,
    /^mission\s+briefing[^:\n]*:?\s*/im,
    /^briefing[^:\n]*:?\s*/im,
    /^here'?s?\s+(?:the\s+)?(?:mission\s+)?briefing[^:\n]*:?\s*/im,
    /^(?:sentence\s+\d+|paragraph)[^:\n]*:?\s*/im,
    /^output[^:\n]*:?\s*/im,
  ];
  for (const p of preamblePatterns) {
    text = text.replace(p, "");
  }

  return text
    // Strip markdown code fences
    .replace(/```[\s\S]*?```/g, "")
    // Strip inline backticks
    .replace(/`[^`]*`/g, "")
    // Strip markdown headings
    .replace(/^#{1,6}\s+.*/gm, "")
    // Strip chain-of-thought lines
    .replace(/^(step\s*\d+[:\-.]?.*|thinking[:\-.]?.*|reasoning[:\-.]?.*)/gim, "")
    // Strip JSON-like lines
    .replace(/^\s*[\{\[].*/gm, "")
    // Strip bold/italic markers
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1")
    // Collapse multiple blank lines to one
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* ── route handler ───────────────────────────────────────────────────────── */
export async function POST(req: NextRequest) {
  try {
    const body: unknown = await req.json();
    const query = (body as Record<string, unknown>)?.query ?? "show approaching asteroids";

    const nasaKey = process.env.NASA_API_KEY;
    if (!nasaKey) {
      return NextResponse.json<SentinelData>(
        { agent: "sentinel", items: [], count: 0, summary: "NASA_API_KEY is not configured.", error: "NASA_API_KEY missing" },
        { status: 500 }
      );
    }

    // 7-day window starting today
    const start = new Date();
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const dateRange = { start: dateStr(start), end: dateStr(end) };

    const neowsUrl =
      `https://api.nasa.gov/neo/rest/v1/feed` +
      `?start_date=${dateRange.start}&end_date=${dateRange.end}&api_key=${nasaKey}`;

    const feedRes = await fetch(neowsUrl, { cache: "no-store" });
    if (!feedRes.ok) {
      const errText = await feedRes.text();
      throw new Error(`NeoWs API returned ${feedRes.status}: ${errText}`);
    }
    const feed = (await feedRes.json()) as NeoWsFeed;
    const items = flattenNeo(feed);

    // Generate summary — try Gemini first; fall back to watsonx (non-fatal)
    const prompt = buildSentinelPrompt(items, dateRange);
    let summary = `${items.length} near-Earth objects tracked from ${dateRange.start} to ${dateRange.end}.`;
    let modelUsed = "fallback";
    try {
      const raw = await generateTextGemini(prompt, {
        maxOutputTokens: 1500, // Fix S3: 1500 gives thinking model room to complete the response
        temperature: 0.2,
      });
      const cleaned = cleanSummary(raw);
      if (cleaned.length > 20) { summary = cleaned; modelUsed = "gemini-3.5-flash"; }
    } catch (geminiErr) {
      console.warn("[sentinel] gemini summary failed, falling back to watsonx:", geminiErr);
      try {
        const raw = await generateText(prompt, {
          maxNewTokens: 350, // Fix S6: 350 tokens is enough for 3 sentences
          temperature: 0.2,
        });
        const cleaned = cleanSummary(raw);
        if (cleaned.length > 20) { summary = cleaned; modelUsed = "llama-4-maverick"; }
      } catch (llmErr) {
        // Both LLMs failed — surface data with static fallback summary
        console.warn("[sentinel] watsonx summary also failed:", llmErr);
      }
    }

    const response: SentinelData = {
      agent: "sentinel",
      items,
      count: items.length,
      summary,
      date_range: dateRange,
      model_used: modelUsed,
    };

    void query; // query used for routing context; NeoWs always returns 7-day window
    return NextResponse.json(response, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json<SentinelData>(
      { agent: "sentinel", items: [], count: 0, summary: "", error: message },
      { status: 500 }
    );
  }
}
