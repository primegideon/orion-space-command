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

const SUMMARY_PROMPT = (
  items: FlareItem[],
  period: { start: string; end: string }
) => `\
You are FORECASTER, the solar weather analyst for ORION Space Command.
Solar flare events detected between ${period.start} and ${period.end}:
${items.length === 0 ? "No flares detected." : items.slice(0, 15).map((f) => `- ${f.class_type} flare at ${f.peak_time ?? f.begin_time}${f.source_location ? ` from ${f.source_location}` : ""}`).join("\n")}

Write a single paragraph of 2-3 sentences as a professional space-weather advisory. Mention the total flare count, highlight the most severe class observed, and state any risk to satellites or communications. Output only the advisory paragraph — no headings, no bullet points, no markdown, no JSON, no step-by-step reasoning, no preamble.`;

/* ── output sanitiser ────────────────────────────────────────────────────── */
function cleanSummary(raw: string): string {
  let text = raw;

  // If the model emitted an edit/rewrite marker, keep only the final version
  const editMarkers = [
    /\bis\s+rewritten\s+to\s*:?\s*/i,
    /\bhas\s+been\s+rewritten\s+as\s*:?\s*/i,
    /\brevised\s+version\s*:?\s*/i,
    /\bupdated\s+paragraph\s*:?\s*/i,
    /\bhere\s+is\s+the\s+rewritten[^:\n]*:?\s*/i,
    /\bhere'?s?\s+the\s+(?:rewritten|updated|revised)[^:\n]*:?\s*/i,
  ];
  for (const marker of editMarkers) {
    const parts = text.split(marker);
    if (parts.length > 1) {
      text = parts[parts.length - 1];
    }
  }

  text = text
    // Strip markdown code fences (```...```)
    .replace(/```[\s\S]*?```/g, "")
    // Strip inline backticks
    .replace(/`[^`]*`/g, "")
    // Strip markdown headings (## Step 1, ### etc.)
    .replace(/^#{1,6}\s+.*/gm, "")
    // Strip lines that look like chain-of-thought steps
    .replace(/^(step\s*\d+[:\-.]?.*|thinking[:\-.]?.*|reasoning[:\-.]?.*)/gim, "")
    // Strip JSON-like lines
    .replace(/^\s*[\{\[].*/gm, "")
    // Strip bold/italic markers
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1")
    // Collapse multiple blank lines to one
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // De-duplicate: if the same sentence block appears twice in a row
  // (model repeated itself without any marker), keep only the first occurrence.
  // Split on sentence boundaries, then check for a repeated run of ≥3 sentences.
  const sentences = text.split(/(?<=[.!?])\s+/);
  if (sentences.length >= 6) {
    const half = Math.floor(sentences.length / 2);
    const firstHalf  = sentences.slice(0, half).join(" ").toLowerCase();
    const secondHalf = sentences.slice(sentences.length - half).join(" ").toLowerCase();
    // Levenshtein-free similarity: if second half starts with ≥60% of first half's words
    const firstWords  = new Set(firstHalf.split(/\W+/).filter(Boolean));
    const secondWords = secondHalf.split(/\W+/).filter(Boolean);
    const overlap = secondWords.filter(w => firstWords.has(w)).length;
    if (overlap / firstWords.size > 0.6) {
      text = sentences.slice(0, half).join(" ").trim();
    }
  }

  return text;
}

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

    const flrRes = await fetch(donkiUrl, { cache: "no-store" });
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
      const cleaned = cleanSummary(raw);
      if (cleaned.length > 20) summary = cleaned;
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
