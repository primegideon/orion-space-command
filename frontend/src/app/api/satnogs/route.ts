/**
 * /api/satnogs — Active SatNOGS Decentralized Ground Stations
 *
 * The SatNOGS API returns one giant ~2.8 MB array of all stations.
 * We stream the response, collect up to SAMPLE_SIZE online stations,
 * then pick MAX_STATIONS spread evenly across 5 longitude bands so the
 * map shows a global distribution instead of a European cluster.
 *
 * Cache: 5 minutes (station availability changes slowly)
 */
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SATNOGS_URL  = "https://network.satnogs.org/api/stations/?format=json";
const MAX_STATIONS = 35;   // final cap shown on map
const SAMPLE_SIZE  = 300;  // stream until we have this many online candidates

// 5 longitude bands covering the globe — ~7 stations per band = 35 total
const BANDS = [
  { min: -180, max:  -90 }, // Americas West (US West, Pacific)
  { min:  -90, max:    0 }, // Americas East / Atlantic
  { min:    0, max:   60 }, // Europe / Africa
  { min:   60, max:  120 }, // Middle East / South Asia
  { min:  120, max:  180 }, // East Asia / Pacific / Oceania
] as const;

interface SatnogsApiStation {
  id: number;
  name: string;
  lat: number;
  lng: number;
  altitude: number;
  status: string;
  antenna_count?: number;
}

export interface SatnogsStation {
  id: number;
  name: string;
  lat: number;
  lng: number;
  altitude_m: number;
  status: "Online";
  antennas: number;
}

export interface SatnogsResponse {
  stations: SatnogsStation[];
  count: number;
  source: "satnogs";
  fetched_at: string;
}

/**
 * Stream-parse the SatNOGS JSON array until SAMPLE_SIZE online stations
 * are collected, then pick MAX_STATIONS spread across longitude bands.
 */
async function fetchSatnogsStreamed(): Promise<SatnogsStation[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);

  const res = await fetch(SATNOGS_URL, {
    headers: { "User-Agent": "Mozilla/5.0", "Accept-Encoding": "gzip, deflate" },
    signal: controller.signal,
    next: { revalidate: 300 },
  });

  if (!res.ok || !res.body) {
    clearTimeout(timeout);
    return [];
  }

  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  const pool: SatnogsStation[] = [];

  let buffer  = "";
  let depth   = 0;
  let inStr   = false;
  let escape  = false;
  let objStart = -1;

  outer: while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    for (let i = 0; i < buffer.length; i++) {
      const ch = buffer[i];
      if (escape)                    { escape = false; continue; }
      if (ch === "\\" && inStr)      { escape = true;  continue; }
      if (ch === '"')                { inStr = !inStr; continue; }
      if (inStr)                     continue;

      if (ch === "{") {
        if (depth === 0) objStart = i;
        depth++;
      } else if (ch === "}") {
        depth--;
        if (depth === 0 && objStart !== -1) {
          const raw = buffer.slice(objStart, i + 1);
          objStart = -1;
          try {
            const s = JSON.parse(raw) as SatnogsApiStation;
            if (s.status === "Online" && typeof s.lat === "number" && typeof s.lng === "number") {
              pool.push({
                id:         s.id,
                name:       s.name,
                lat:        s.lat,
                lng:        s.lng,
                altitude_m: s.altitude ?? 0,
                status:     "Online",
                antennas:   s.antenna_count ?? 1,
              });
              if (pool.length >= SAMPLE_SIZE) break outer;
            }
          } catch { /* skip malformed */ }
          buffer = buffer.slice(i + 1);
          i = -1;
        }
      }
    }
  }

  clearTimeout(timeout);
  try { reader.cancel(); } catch { /* already closed */ }

  // Spread across longitude bands — pick up to perBand from each, fill gaps with remainder
  const perBand = Math.ceil(MAX_STATIONS / BANDS.length); // 7
  const result: SatnogsStation[] = [];

  for (const band of BANDS) {
    const inBand = pool.filter(s => s.lng >= band.min && s.lng < band.max);
    result.push(...inBand.slice(0, perBand));
  }

  // If some bands were sparse, top up with whatever is left from the pool (avoiding dupes)
  if (result.length < MAX_STATIONS) {
    const used = new Set(result.map(s => s.id));
    for (const s of pool) {
      if (!used.has(s.id)) { result.push(s); used.add(s.id); }
      if (result.length >= MAX_STATIONS) break;
    }
  }

  return result.slice(0, MAX_STATIONS);
}

export async function GET() {
  try {
    const stations = await fetchSatnogsStreamed();

    return NextResponse.json<SatnogsResponse>({
      stations,
      count: stations.length,
      source: "satnogs",
      fetched_at: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: msg, stations: [], count: 0, source: "satnogs", fetched_at: new Date().toISOString() },
      { status: 502 }
    );
  }
}
