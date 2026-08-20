/**
 * /api/agent/forecaster — Solar Weather Sub-Agent
 *
 * 1. Fetches NASA DONKI solar flare events for a 30-day lookback
 * 2. Normalises the response into FlareItem[]
 * 3. Calls IBM watsonx for a natural-language summary
 * 4. Returns ForecasterData JSON (identical contract to V1)
 */
import { NextRequest, NextResponse } from "next/server";
import { generateText } from "@/lib/watsonx";
import type { ForecasterData, FlareItem } from "@/components/ForecasterPanel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ── NASA DONKI types (partial) ──────────────────────────────────────────── */
interface DonkiFlare {
  flrID: string;
  classType: string;
  beginTime: string;
  peakTime: string;
  endTime: string;
  sourceLocation: string | null;
  activeRegionNum: number | null;
}

/* ── helpers ─────────────────────────────────────────────────────────────── */
function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function mapFlare(f: DonkiFlare): FlareItem {
  return {
    flr_id: f.flrID,
    class_type: f.classType,
    begin_time: f.beginTime,
    peak_time: f.peakTime,
    end_time: f.endTime,
    source_location: f.sourceLocation ?? null,
    active_region: f.activeRegionNum ?? null,
  };
}

const SUMMARY_PROMPT = (
  items: FlareItem[],
  period: { start: string; end: string }
) => `\
You are FORECASTER, the solar weather analyst for ORION Space Command.
Below is a list of solar flares detected between ${period.start} and ${period.end}.

Data (JSON):
${JSON.stringify(items.slice(0, 15), null, 2)}

Write a concise 2-3 sentence mission briefing. Highlight any X-class or M-class flares, the peak activity period, and any risk to communications or satellites. If no flares occurred, note the quiet solar conditions.`;

/* ── route handler ───────────────────────────────────────────────────────── */
export async function POST(req: NextRequest) {
  try {
    const body: unknown = await req.json();
    const query = (body as Record<string, unknown>)?.query ?? "show solar weather";

    const nasaKey = process.env.NASA_API_KEY;
    if (!nasaKey) {
      return NextResponse.json<ForecasterData>(
        { agent: "forecaster", items: [], count: 0, summary: "NASA_API_KEY is not configured.", error: "NASA_API_KEY missing" },
        { status: 500 }
      );
    }

    // 30-day lookback
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 30);
    const period = { start: dateStr(start), end: dateStr(end) };

    const donkiUrl =
      `https://api.nasa.gov/DONKI/FLR` +
      `?startDate=${period.start}&endDate=${period.end}&api_key=${nasaKey}`;

    const flrRes = await fetch(donkiUrl);
    if (!flrRes.ok) {
      const errText = await flrRes.text();
      throw new Error(`DONKI API returned ${flrRes.status}: ${errText}`);
    }

    // DONKI returns null for quiet periods — normalise to empty array
    const raw: DonkiFlare[] | null = (await flrRes.json()) as DonkiFlare[] | null;
    const flares = raw ?? [];
    const items: FlareItem[] = flares.map(mapFlare);

    // Sort by begin_time descending (most recent first)
    items.sort((a, b) => b.begin_time.localeCompare(a.begin_time));

    let summary =
      items.length === 0
        ? `No solar flares detected between ${period.start} and ${period.end}. Solar activity is quiet.`
        : `${items.length} solar flare(s) detected from ${period.start} to ${period.end}.`;

    try {
      const raw = await generateText(SUMMARY_PROMPT(items, period), {
        maxNewTokens: 200,
        temperature: 0.3,
      });
      if (raw.length > 20) summary = raw;
    } catch (llmErr) {
      console.warn("[forecaster] watsonx summary failed:", llmErr);
    }

    const response: ForecasterData = {
      agent: "forecaster",
      items,
      count: items.length,
      summary,
      period,
    };

    void query;
    return NextResponse.json(response, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json<ForecasterData>(
      { agent: "forecaster", items: [], count: 0, summary: "", error: message },
      { status: 500 }
    );
  }
}
