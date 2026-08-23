/**
 * /api/satellites — Real satellite orbital parameters from CelesTrak satcat API
 *
 * Uses celestrak.org/satcat/records.php?CATNR=<id>&FORMAT=JSON which returns
 * live orbital elements (PERIOD, INCLINATION, APOGEE, PERIGEE) per satellite.
 * Fetches all target IDs in parallel — no TLE parsing required.
 */
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Curated list: NORAD ID + friendly display name
const TARGETS = [
  { id: 25544, label: "ISS (ZARYA)" },
  { id: 48274, label: "CSS (TIANHE)" },
  { id: 20580, label: "HST" },
  { id: 43013, label: "NOAA 20" },
  { id: 41866, label: "GOES 16" },
  { id: 51850, label: "GOES 18" },
  { id: 49260, label: "LANDSAT 9" },
  { id: 27424, label: "AQUA" },
  { id: 36411, label: "CRYOSAT-2" },
  { id: 44914, label: "GOES 17" },
  { id: 25682, label: "TERRA" },
  { id: 27875, label: "AURA" },
];

// CelesTrak satcat record shape
interface SatcatRecord {
  OBJECT_NAME: string;
  NORAD_CAT_ID: number;
  OPS_STATUS_CODE: string;   // "+" active, "-" dead, "B" storage, etc.
  PERIOD: number;            // minutes
  INCLINATION: number;       // degrees
  APOGEE: number;            // km above equatorial radius
  PERIGEE: number;           // km
  DECAY_DATE: string;
}

export type SatHealth = "NOMINAL" | "DEGRADED" | "CRITICAL" | "OFFLINE";

export interface SatelliteRecord {
  norad_id: number;
  name: string;
  band: "LEO" | "MEO" | "GEO" | "HEO";
  altitude_km: number;       // mean of apogee + perigee
  inclination_deg: number;
  period_min: number;
  eccentricity: number;      // derived from apogee/perigee
  health: SatHealth;
  source: "celestrak";
}

const RE = 6378.137;         // Earth equatorial radius km

function classifyBand(alt: number): SatelliteRecord["band"] {
  if (alt < 2000)  return "LEO";
  if (alt < 35000) return "MEO";
  if (alt < 36500) return "GEO";
  return "HEO";
}

function statusToHealth(code: string, decayDate: string): SatHealth {
  if (decayDate && decayDate.length > 0)  return "OFFLINE";
  if (code === "+")  return "NOMINAL";
  if (code === "B")  return "DEGRADED";   // storage / standby
  if (code === "-")  return "OFFLINE";
  return "DEGRADED";
}

/** Eccentricity from apogee/perigee (both in km above surface) */
function eccFromApogeePerigee(apogee: number, perigee: number): number {
  const ra = apogee  + RE;
  const rp = perigee + RE;
  return Math.round(((ra - rp) / (ra + rp)) * 10000) / 10000;
}

function satcatToRecord(rec: SatcatRecord, label: string): SatelliteRecord {
  const alt = Math.round((rec.APOGEE + rec.PERIGEE) / 2);
  return {
    norad_id:       rec.NORAD_CAT_ID,
    name:           label,
    band:           classifyBand(alt),
    altitude_km:    alt,
    inclination_deg: Math.round(rec.INCLINATION * 10) / 10,
    period_min:     Math.round(rec.PERIOD * 10) / 10,
    eccentricity:   eccFromApogeePerigee(rec.APOGEE, rec.PERIGEE),
    health:         statusToHealth(rec.OPS_STATUS_CODE, rec.DECAY_DATE),
    source:         "celestrak",
  };
}

export interface SatellitesResponse {
  satellites: SatelliteRecord[];
  count: number;
  source: "celestrak";
  fetched_at: string;
}

export async function GET() {
  try {
    // Fetch all targets in parallel
    const results = await Promise.allSettled(
      TARGETS.map(({ id, label }) =>
        fetch(
          `https://celestrak.org/satcat/records.php?CATNR=${id}&FORMAT=JSON`,
          {
            next: { revalidate: 3600 },
            headers: { "User-Agent": "Mozilla/5.0" },
          }
        )
          .then((r) => {
            if (!r.ok) throw new Error(`${r.status}`);
            return r.json() as Promise<SatcatRecord[]>;
          })
          .then((data): SatelliteRecord | null => {
            const rec = data?.[0];
            if (!rec) return null;
            return satcatToRecord(rec, label);
          })
      )
    );

    const satellites: SatelliteRecord[] = results
      .filter(
        (r): r is PromiseFulfilledResult<SatelliteRecord | null> =>
          r.status === "fulfilled" && r.value !== null
      )
      .map((r) => r.value as SatelliteRecord);

    if (satellites.length === 0) {
      throw new Error("All CelesTrak satcat requests failed");
    }

    const payload: SatellitesResponse = {
      satellites,
      count: satellites.length,
      source: "celestrak",
      fetched_at: new Date().toISOString(),
    };

    return NextResponse.json(payload);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: msg, satellites: [], count: 0, source: "celestrak" },
      { status: 502 }
    );
  }
}
