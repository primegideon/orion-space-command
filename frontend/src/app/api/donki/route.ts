/**
 * /api/donki — NOAA DONKI Solar Flare + Radio Blackout (R-Scale) feed
 *
 * Fetches the last 7 days of Solar Flare events from NOAA DONKI and derives
 * an R-Scale radio-blackout score from the worst active event.
 *
 * NOAA DONKI endpoint:
 *   https://kauai.ccmc.gsfc.nasa.gov/DONKI/WS/get/FLR?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 *
 * R-Scale mapping (NOAA Space Weather Scales):
 *   R1 (C5–C9)   → C-class mid/upper  → flareScore  10
 *   R2 (M1–M4)   → M-class lower       → flareScore 100
 *   R3 (M5+)     → M-class upper       → flareScore 500
 *   R4 (X1–X9)   → X-class             → flareScore 1000
 *   R5 (X10+)    → Major X-class       → flareScore 10000
 */
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DONKI_BASE = "https://kauai.ccmc.gsfc.nasa.gov/DONKI/WS/get/FLR";

export interface DonkiFlare {
  flrID: string;
  beginTime: string;
  peakTime: string | null;
  endTime: string | null;
  classType: string;       // e.g. "M5.3", "X1.2", "C7.0"
  sourceLocation: string;
  activeRegionNum: number | null;
}

export type RScale = "R0" | "R1" | "R2" | "R3" | "R4" | "R5";

export interface DonkiResponse {
  /** Worst active flare class in the window, e.g. "X1.2" or null */
  worstClass: string | null;
  /** NOAA R-Scale derived from worst class */
  rScale: RScale;
  /** Numeric score used by band degradation logic */
  flareScore: number;
  /** Human-readable radio blackout status */
  radioBlackout: string;
  /** Subset of flares (last 6 events, most recent first) */
  recentFlares: DonkiFlare[];
  source: "noaa-donki";
  fetched_at: string;
}

/** Classify a GOES X-ray class string into an R-Scale and numeric score */
function classifyFlare(classType: string): { rScale: RScale; score: number } {
  const upper = classType.toUpperCase().trim();
  const letter = upper.charAt(0);
  const num = parseFloat(upper.slice(1)) || 0;

  if (letter === "X") {
    if (num >= 10) return { rScale: "R5", score: 10000 };
    return { rScale: "R4", score: 1000 + num * 10 };
  }
  if (letter === "M") {
    if (num >= 5) return { rScale: "R3", score: 500 + num };
    return { rScale: "R2", score: 100 + num * 10 };
  }
  if (letter === "C") {
    if (num >= 5) return { rScale: "R1", score: 10 + num };
    return { rScale: "R0", score: num };
  }
  return { rScale: "R0", score: 0 };
}

function rScaleLabel(rs: RScale): string {
  switch (rs) {
    case "R5": return "Extreme Radio Blackout (R5)";
    case "R4": return "Severe Radio Blackout (R4)";
    case "R3": return "Strong Radio Blackout (R3)";
    case "R2": return "Moderate Radio Blackout (R2)";
    case "R1": return "Minor Radio Blackout (R1)";
    default:   return "No Radio Blackout (R0)";
  }
}

function isoDateStr(daysBack = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysBack);
  return d.toISOString().slice(0, 10);
}

export async function GET() {
  try {
    const startDate = isoDateStr(7);
    const endDate   = isoDateStr(0);
    const url = `${DONKI_BASE}?startDate=${startDate}&endDate=${endDate}`;

    const res = await fetch(url, {
      next: { revalidate: 300 },  // cache 5 min
      headers: { "User-Agent": "ORION-SpaceCommand/2.0" },
    });

    if (!res.ok) throw new Error(`DONKI returned ${res.status}`);

    const flares = (await res.json()) as DonkiFlare[];

    if (!Array.isArray(flares)) throw new Error("Unexpected DONKI response shape");

    // Find worst flare in the window
    let worstScore   = 0;
    let worstClass: string | null = null;
    let worstRScale: RScale = "R0";

    for (const f of flares) {
      if (!f.classType) continue;
      const { rScale, score } = classifyFlare(f.classType);
      if (score > worstScore) {
        worstScore  = score;
        worstClass  = f.classType;
        worstRScale = rScale;
      }
    }

    // Most recent 6 flares, newest first
    const recentFlares = [...flares]
      .sort((a, b) => new Date(b.beginTime).getTime() - new Date(a.beginTime).getTime())
      .slice(0, 6);

    const payload: DonkiResponse = {
      worstClass,
      rScale:        worstRScale,
      flareScore:    worstScore,
      radioBlackout: rScaleLabel(worstRScale),
      recentFlares,
      source:        "noaa-donki",
      fetched_at:    new Date().toISOString(),
    };

    return NextResponse.json(payload);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Return a safe fallback so the UI stays functional if DONKI is unreachable
    const fallback: DonkiResponse = {
      worstClass:    null,
      rScale:        "R0",
      flareScore:    0,
      radioBlackout: "No Radio Blackout (R0)",
      recentFlares:  [],
      source:        "noaa-donki",
      fetched_at:    new Date().toISOString(),
    };
    return NextResponse.json({ ...fallback, error: msg });
  }
}
