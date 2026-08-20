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
import type { SentinelData, AsteroidItem } from "@/components/SentinelPanel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

const SUMMARY_PROMPT = (items: AsteroidItem[], dateRange: { start: string; end: string }) => `\
You are SENTINEL, the near-Earth object monitoring agent for ORION Space Command.
Below is a list of asteroids approaching Earth between ${dateRange.start} and ${dateRange.end}.

Data (JSON):
${JSON.stringify(items.slice(0, 20), null, 2)}

Write a concise 2-3 sentence mission briefing for the crew. Highlight any potentially hazardous objects (PHO), the closest approach, and the overall threat level. Be factual and precise.`;

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

    const feedRes = await fetch(neowsUrl);
    if (!feedRes.ok) {
      const errText = await feedRes.text();
      throw new Error(`NeoWs API returned ${feedRes.status}: ${errText}`);
    }
    const feed = (await feedRes.json()) as NeoWsFeed;
    const items = flattenNeo(feed);

    // Generate summary via watsonx (non-fatal — degrade gracefully)
    let summary = `${items.length} near-Earth objects tracked from ${dateRange.start} to ${dateRange.end}.`;
    try {
      const raw = await generateText(SUMMARY_PROMPT(items, dateRange), {
        maxNewTokens: 200,
        temperature: 0.3,
      });
      if (raw.length > 20) summary = raw;
    } catch (llmErr) {
      // LLM failure is non-fatal — surface data with fallback summary
      console.warn("[sentinel] watsonx summary failed:", llmErr);
    }

    const response: SentinelData = {
      agent: "sentinel",
      items,
      count: items.length,
      summary,
      date_range: dateRange,
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
