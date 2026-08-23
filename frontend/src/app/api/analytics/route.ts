/**
 * GET /api/analytics — 30-day threat & risk aggregates
 *
 * Server-side TTL cache (15 min) prevents hammering NASA APIs on every render.
 * Pass ?bust=1 to skip the cache and force a fresh network request.
 *
 * Sources:
 *   1. NASA DONKI /FLR          — 30-day solar flares
 *   2. NASA DONKI /CMEAnalysis  — 30-day CME speeds
 *   3. NASA NeoWs /feed         — 30-day NEO close approaches
 *   4. NOAA SWPC Kp             — current geomagnetic index
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ── In-process TTL cache (survives across requests in the same serverless instance) ── */
const TTL_MS = 15 * 60 * 1000; // 15 minutes
let cachedPayload: AnalyticsResponse | null = null;
let cacheTimestamp = 0;

/* ── date helpers ──────────────────────────────────────────────────────────*/
function iso(d: Date) { return d.toISOString().slice(0, 10); }
function mmdd(iso8601: string) { return iso8601.slice(5, 10); }

function daysAgo(n: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

/* ── NASA DONKI types ──────────────────────────────────────────────────────*/
interface DonkiFlareRaw {
  flrID:           string;
  classType:       string;
  beginTime:       string;   // "2025-07-01T08:32Z"
  peakTime:        string | null;
}

interface DonkiCmeAnalysis {
  speed: number | null;
  type:  string;
}
interface DonkiCmeRaw {
  activityID:  string;
  startTime:   string;
  cmeAnalyses: DonkiCmeAnalysis[] | null;
}

/* ── NeoWs types ───────────────────────────────────────────────────────────*/
interface NeoCloseApproach {
  close_approach_date: string;
  miss_distance:       { kilometers: string };
}
interface NeoObject {
  id:   string;
  name: string;
  is_potentially_hazardous_asteroid: boolean;
  close_approach_data: NeoCloseApproach[];
}
interface NeoFeed {
  near_earth_objects: Record<string, NeoObject[]>;
}

/* ── NOAA Kp types ─────────────────────────────────────────────────────────*/
interface NoaaKpRecord { time_tag: string; Kp: number | string; }

/* ── Exported response shape ───────────────────────────────────────────────*/

export interface FlareDayPoint {
  day:  string;   // "MM-DD"
  B:    number;
  C:    number;
  M:    number;
  X:    number;
}

export interface CmeDayPoint {
  day:   string;  // "MM-DD"
  speed: number;  // max speed that day (km/s), 0 if none
}

export interface AnalyticsMetrics {
  totalFlares:   number;
  xCount:        number;
  mCount:        number;
  maxCmeSpeed:   number;     // km/s, 0 if no CMEs
  phoCount:      number;     // PHOs in the 30-day window
  kpCurrent:     number | null;
  kpStatus:      "NOMINAL" | "ELEVATED" | "STORM" | "SEVERE" | null;
  worstFlareClass: string | null;  // e.g. "X2.4" or null
}

export interface AnalyticsResponse {
  metrics:    AnalyticsMetrics;
  flareChart: FlareDayPoint[];   // 30 points, one per day
  cmeChart:   CmeDayPoint[];     // 30 points, one per day
  windowDays: number;
  startDate:  string;
  endDate:    string;
  fetched_at: string;
  errors:     string[];          // non-fatal per-source errors
}

/* ── flare class helpers ───────────────────────────────────────────────────*/
function flareLetterAndScore(classType: string): { letter: string; score: number } {
  const u = (classType ?? "").toUpperCase().trim();
  const letter = u.charAt(0);
  const num    = parseFloat(u.slice(1)) || 0;
  let score = 0;
  if (letter === "X") score = 1000 + num;
  else if (letter === "M") score = 100 + num;
  else if (letter === "C") score = 10 + num;
  else if (letter === "B") score = num;
  return { letter: letter || "?", score };
}

function classifyKp(kp: number): AnalyticsMetrics["kpStatus"] {
  if (kp >= 7) return "SEVERE";
  if (kp >= 5) return "STORM";
  if (kp >= 4) return "ELEVATED";
  return "NOMINAL";
}

/* ── main handler ──────────────────────────────────────────────────────────*/
export async function GET(req: NextRequest) {
  const bust = req.nextUrl.searchParams.get("bust") === "1";

  // Serve from cache if still fresh and not a forced refresh
  if (!bust && cachedPayload && Date.now() - cacheTimestamp < TTL_MS) {
    return NextResponse.json({ ...cachedPayload, cache: "hit" });
  }

  try {
    const payload = await runAnalytics();
    cachedPayload  = payload;
    cacheTimestamp = Date.now();
    return NextResponse.json({ ...payload, cache: "miss" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg, errors: [msg], metrics: null, flareChart: [], cmeChart: [], windowDays: 30 }, { status: 500 });
  }
}

async function runAnalytics(): Promise<AnalyticsResponse & { cache?: string }> {
  const WINDOW = 30;
  const endDate   = new Date();
  const startDate = daysAgo(WINDOW);
  const start = iso(startDate);
  const end   = iso(endDate);

  const nasaKey = process.env.NASA_API_KEY ?? "";
  const errors: string[] = [];

  /* ── build day-keyed buckets for all 30 days ─────────────────────────── */
  const dayKeys: string[] = [];
  for (let i = 0; i < WINDOW; i++) {
    const d = daysAgo(WINDOW - 1 - i);
    dayKeys.push(iso(d));
  }

  const flareBuckets: Record<string, { B: number; C: number; M: number; X: number }> = {};
  const cmeBuckets:   Record<string, number[]> = {};
  for (const k of dayKeys) {
    flareBuckets[k] = { B: 0, C: 0, M: 0, X: 0 };
    cmeBuckets[k]   = [];
  }

  /* ── 1. DONKI solar flares ───────────────────────────────────────────── */
  let worstFlareScore = 0;
  let worstFlareClass: string | null = null;
  let xCount = 0;
  let mCount = 0;
  let totalFlares = 0;

  try {
    const flrRes = await fetch(
      `https://api.nasa.gov/DONKI/FLR?startDate=${start}&endDate=${end}&api_key=${nasaKey}`,
      { cache: "no-store", headers: { "User-Agent": "ORION-SpaceCommand/2.0" } }
    );
    if (!flrRes.ok) throw new Error(`DONKI/FLR HTTP ${flrRes.status}`);

    const raw: DonkiFlareRaw[] | null = await flrRes.json() as DonkiFlareRaw[] | null;
    const flares = raw ?? [];
    totalFlares = flares.length;

    for (const f of flares) {
      const dateKey = (f.beginTime ?? "").slice(0, 10);
      if (!flareBuckets[dateKey]) continue;

      const { letter, score } = flareLetterAndScore(f.classType);
      if (letter === "B") flareBuckets[dateKey].B++;
      else if (letter === "C") flareBuckets[dateKey].C++;
      else if (letter === "M") { flareBuckets[dateKey].M++; mCount++; }
      else if (letter === "X") { flareBuckets[dateKey].X++; xCount++; }

      if (score > worstFlareScore) {
        worstFlareScore = score;
        worstFlareClass = f.classType;
      }
    }
  } catch (e) {
    errors.push(`DONKI flares: ${e instanceof Error ? e.message : String(e)}`);
  }

  /* ── 2. DONKI CMEs ───────────────────────────────────────────────────── */
  let maxCmeSpeed = 0;

  try {
    const cmeRes = await fetch(
      `https://api.nasa.gov/DONKI/CMEAnalysis?startDate=${start}&endDate=${end}&mostAccurateOnly=true&api_key=${nasaKey}`,
      { cache: "no-store", headers: { "User-Agent": "ORION-SpaceCommand/2.0" } }
    );
    if (!cmeRes.ok) throw new Error(`DONKI/CMEAnalysis HTTP ${cmeRes.status}`);

    // CMEAnalysis returns flat analysis objects directly
    interface CmeAnalysisRaw {
      time21_5:    string;   // e.g. "2025-07-01T14:15Z"
      speed:       number | null;
      type:        string;
    }
    const raw: CmeAnalysisRaw[] | null = await cmeRes.json() as CmeAnalysisRaw[] | null;
    const analyses = raw ?? [];

    for (const a of analyses) {
      const speed = typeof a.speed === "number" ? a.speed : 0;
      const dateKey = (a.time21_5 ?? "").slice(0, 10);
      if (cmeBuckets[dateKey]) cmeBuckets[dateKey].push(speed);
      if (speed > maxCmeSpeed) maxCmeSpeed = speed;
    }
  } catch (e) {
    // Fallback: NASA /CME endpoint
    try {
      const cmeUrl2 =
        `https://api.nasa.gov/DONKI/CME?startDate=${start}&endDate=${end}&api_key=${nasaKey}`;
      const cmeRes2 = await fetch(cmeUrl2, {
        cache: "no-store",
        headers: { "User-Agent": "ORION-SpaceCommand/2.0" },
      });
      if (cmeRes2.ok) {
        const raw2: DonkiCmeRaw[] | null = await cmeRes2.json() as DonkiCmeRaw[] | null;
        for (const c of raw2 ?? []) {
          const analyses = c.cmeAnalyses ?? [];
          const dateKey  = (c.startTime ?? "").slice(0, 10);
          for (const a of analyses) {
            const speed = a.speed ?? 0;
            if (cmeBuckets[dateKey]) cmeBuckets[dateKey].push(speed);
            if (speed > maxCmeSpeed) maxCmeSpeed = speed;
          }
        }
      }
    } catch { /* ignore secondary fallback error */ }
    errors.push(`DONKI CME: ${e instanceof Error ? e.message : String(e)}`);
  }

  /* ── 3. NeoWs 30-day PHO count ───────────────────────────────────────── */
  // NeoWs only accepts 7-day windows; fan out 5 sequential requests
  let phoCount = 0;
  try {
    const chunks: Array<{ s: string; e: string }> = [];
    for (let i = 0; i < WINDOW; i += 7) {
      const s = daysAgo(WINDOW - i);
      const e = daysAgo(Math.max(0, WINDOW - i - 7));
      chunks.push({ s: iso(s), e: iso(e) });
    }
    const neoResults = await Promise.allSettled(
      chunks.map(({ s, e }) =>
        fetch(
          `https://api.nasa.gov/neo/rest/v1/feed?start_date=${s}&end_date=${e}&api_key=${nasaKey}`,
          { cache: "no-store", headers: { "User-Agent": "ORION-SpaceCommand/2.0" } }
        ).then(r => r.json() as Promise<NeoFeed>)
      )
    );
    for (const res of neoResults) {
      if (res.status !== "fulfilled") continue;
      const feed = res.value;
      for (const neos of Object.values(feed.near_earth_objects ?? {})) {
        for (const neo of neos) {
          if (neo.is_potentially_hazardous_asteroid) phoCount++;
        }
      }
    }
  } catch (e) {
    errors.push(`NeoWs: ${e instanceof Error ? e.message : String(e)}`);
  }

  /* ── 4. NOAA Kp current reading ──────────────────────────────────────── */
  let kpCurrent: number | null = null;
  let kpStatus:  AnalyticsMetrics["kpStatus"] = null;

  try {
    const kpRes = await fetch(
      "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json",
      { cache: "no-store", headers: { "User-Agent": "ORION-SpaceCommand/2.0" } }
    );
    if (kpRes.ok) {
      const raw: unknown = await kpRes.json();
      if (Array.isArray(raw) && raw.length > 0) {
        let last: number | null = null;
        if (Array.isArray(raw[0])) {
          const rows = (raw as string[][]).slice(1);
          const lastRow = rows[rows.length - 1];
          last = lastRow ? parseFloat(lastRow[1]) : null;
        } else {
          const recs = raw as NoaaKpRecord[];
          last = parseFloat(String(recs[recs.length - 1]?.Kp));
        }
        if (last !== null && !isNaN(last)) {
          kpCurrent = last;
          kpStatus  = classifyKp(last);
        }
      }
    }
  } catch (e) {
    errors.push(`Kp: ${e instanceof Error ? e.message : String(e)}`);
  }

  /* ── assemble chart arrays ───────────────────────────────────────────── */
  const flareChart: FlareDayPoint[] = dayKeys.map(k => ({
    day: mmdd(k),
    ...flareBuckets[k],
  }));

  const cmeChart: CmeDayPoint[] = dayKeys.map(k => ({
    day:   mmdd(k),
    speed: cmeBuckets[k].length > 0 ? Math.round(Math.max(...cmeBuckets[k])) : 0,
  }));

  const payload: AnalyticsResponse = {
    metrics: {
      totalFlares,
      xCount,
      mCount,
      maxCmeSpeed: Math.round(maxCmeSpeed),
      phoCount,
      kpCurrent,
      kpStatus,
      worstFlareClass,
    },
    flareChart,
    cmeChart,
    windowDays: WINDOW,
    startDate:  start,
    endDate:    end,
    fetched_at: new Date().toISOString(),
    errors,
  };

  return payload;
}
