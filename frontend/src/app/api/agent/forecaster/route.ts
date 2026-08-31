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
import { generateTextGroq } from "@/lib/groq";
import type { ForecasterData, FlareItem } from "@/components/ForecasterPanel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

function buildForecasterPrompt(items: FlareItem[], period: { start: string; end: string }): string {
  // Fix F2 + F3: pre-compute all key facts before the model sees the prompt
  const classPriority: Record<string, number> = { X: 4, M: 3, C: 2, B: 1 };
  const worstClass = items.reduce<string | null>((best, f) => {
    const letter = (f.class_type ?? "").charAt(0).toUpperCase();
    if (!best) return letter;
    return (classPriority[letter] ?? 0) > (classPriority[best] ?? 0) ? letter : best;
  }, null);
  const xCount = items.filter(f => f.class_type?.toUpperCase().startsWith("X")).length;
  const mCount = items.filter(f => f.class_type?.toUpperCase().startsWith("M")).length;
  const cCount = items.filter(f => f.class_type?.toUpperCase().startsWith("C")).length;

  const isQuiet = items.length === 0;

  // Fix F2: explicit quiet-period guidance so model doesn't invent activity
  const quietNote = isQuiet
    ? "\nIMPORTANT: No flares were detected. This is a geomagnetically quiet period. Do NOT invent or imply any solar activity. State that the period was quiet and radiation risk is currently low."
    : "";

  const facts = isQuiet
    ? `Observation period: ${period.start} to ${period.end}\nTotal flares detected: 0\nSolar activity level: QUIET`
    : [
        `Observation period: ${period.start} to ${period.end}`,
        `Total flares detected: ${items.length}`,
        `Worst class observed: ${worstClass ?? "unknown"}`,
        `X-class count: ${xCount}`,
        `M-class count: ${mCount}`,
        `C-class count: ${cCount}`,
      ].join("\n");

  const eventList = isQuiet ? "" : "\nRECENT EVENTS (most recent first):\n" +
    items.slice(0, 15).map(f =>
      `${f.class_type} at ${f.peak_time ?? f.begin_time}${f.source_location ? ` from ${f.source_location}` : ""}${f.active_region ? ` (AR${f.active_region})` : ""}`
    ).join("\n");

  return `You are FORECASTER, the solar weather analyst for ORION Space Command.

PRE-COMPUTED FACTS (use these numbers exactly — do not recalculate):
${facts}${eventList}${quietNote}

Write a 2–3 sentence space-weather advisory for the ORION operator. State the total flare count and observation period, name the worst severity class observed, and state the risk level to satellite communications and power infrastructure. Use the pre-computed facts above verbatim.

OUTPUT RULES: Plain prose paragraph only. No headings. No bullet points. No asterisks. No markdown. No JSON. No numbered lists. No reasoning steps. No preamble. Do not start with "Here is" or any meta-commentary. Start directly with the advisory content.`;
}

/* ── output sanitiser ────────────────────────────────────────────────────── */
function cleanSummary(raw: string): string {
  let text = raw;

  // Strip rewrite/revision markers — keep only the final version
  const editMarkers = [
    /\bis\s+rewritten\s+to\s*:?\s*/i,
    /\bhas\s+been\s+rewritten\s+as\s*:?\s*/i,
    /\brevised\s+version\s*:?\s*/i,
    /\bupdated\s+(?:paragraph|advisory)\s*:?\s*/i,
    /\bhere\s+is\s+the\s+(?:rewritten|updated|revised)[^:\n]*:?\s*/i,
    /\bhere'?s?\s+the\s+(?:rewritten|updated|revised)[^:\n]*:?\s*/i,
    /^here\s+is\s+the\s+(?:space-weather\s+)?advisory[^:\n]*:?\s*/im,
    /^advisory[^:\n]*:?\s*/im,
  ];
  for (const marker of editMarkers) {
    const parts = text.split(marker);
    if (parts.length > 1) text = parts[parts.length - 1];
  }

  text = text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]*`/g, "")
    .replace(/^#{1,6}\s+.*/gm, "")
    .replace(/^(step\s*\d+[:\-.]?.*|thinking[:\-.]?.*|reasoning[:\-.]?.*)/gim, "")
    .replace(/^\s*[\{\[].*/gm, "")
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Fix F1: REMOVED the aggressive word-overlap deduplication heuristic.
  // It was silently chopping valid advisories because solar domain words
  // (solar, flare, activity, period, detected) are shared across sentences.

  return text;
}

/* ── route handler ───────────────────────────────────────────────────────── */
export async function POST(req: NextRequest) {
  try {
    const body: unknown = await req.json();
    const query = (body as Record<string, unknown>)?.query ?? "show solar weather";

    const nasaKey = process.env.NASA_API_KEY ?? "DEMO_KEY";

    // 30-day lookback
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 30);
    const period = { start: dateStr(start), end: dateStr(end) };

    // Race both endpoints simultaneously — whichever responds first wins.
    // 8s timeout total; if both fail we degrade gracefully.
    const endpoints = [
      `https://api.nasa.gov/DONKI/FLR?startDate=${period.start}&endDate=${period.end}&api_key=${nasaKey}`,
      `https://kauai.ccmc.gsfc.nasa.gov/DONKI/WS/get/FLR?startDate=${period.start}&endDate=${period.end}`,
    ];

    let flrRes: Response | null = null;
    let lastErr = "DONKI unreachable";

    const results = await Promise.allSettled(
      endpoints.map(url =>
        fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8_000) })
      )
    );

    for (const result of results) {
      if (result.status === "fulfilled" && result.value.ok) {
        flrRes = result.value;
        break;
      }
      if (result.status === "rejected") {
        lastErr = result.reason instanceof Error ? result.reason.message : String(result.reason);
      } else if (!result.value.ok) {
        lastErr = `DONKI returned ${result.value.status}`;
      }
    }

    if (!flrRes) {
      // Both endpoints unreachable — return graceful degraded response
      return NextResponse.json<ForecasterData>({
        agent: "forecaster",
        items: [],
        count: 0,
        summary: "NASA DONKI solar weather data is temporarily unavailable. Please try again shortly.",
        error: lastErr,
        period,
      });
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

    // Try Groq gpt-oss-120b first; fall back to watsonx (non-fatal)
    const prompt = buildForecasterPrompt(items, period);
    let modelUsed = "fallback";
    try {
      const raw = await generateTextGroq(prompt, {
        maxTokens: 1024,
        temperature: 0.2,
      });
      const cleaned = cleanSummary(raw);
      if (cleaned.length > 20) { summary = cleaned; modelUsed = "gpt-oss-120b-groq"; }
    } catch (groqErr) {
      console.warn("[forecaster] groq summary failed, falling back to watsonx:", groqErr);
      try {
        const raw = await generateText(prompt, {
          maxNewTokens: 350, // Fix F4: 350 tokens is sufficient for 3 sentences
          temperature: 0.2,
        });
        const cleaned = cleanSummary(raw);
        if (cleaned.length > 20) { summary = cleaned; modelUsed = "llama-4-maverick"; }
      } catch (llmErr) {
        console.warn("[forecaster] watsonx summary also failed:", llmErr);
      }
    }

    const response: ForecasterData = {
      agent: "forecaster",
      items,
      count: items.length,
      summary,
      period,
      model_used: modelUsed,
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
