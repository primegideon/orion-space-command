/**
 * /api/tle — Live SGP4 propagation from TLE API
 *
 * Uses https://tle.ivanstanojevic.me/api/tle/{NORAD_ID} which returns
 * live TLE line1/line2 as JSON. Propagates each TLE to current UTC
 * using satellite.js SGP4 to get real-time position and velocity.
 *
 * Cache: 10 minutes per satellite (TLEs are valid for days)
 */
import { NextResponse } from "next/server";
import * as satellite from "satellite.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TARGETS = [
  { id: 25544, name: "ISS (ZARYA)"  },
  { id: 48274, name: "CSS (TIANHE)" },
  { id: 20580, name: "HST"          },
  { id: 43013, name: "NOAA 20"      },
  { id: 41866, name: "GOES 16"      },
  { id: 51850, name: "GOES 18"      },
  { id: 49260, name: "LANDSAT 9"    },
  { id: 27424, name: "AQUA"         },
  { id: 36411, name: "CRYOSAT-2"    },
  { id: 44914, name: "GOES 17"      },
  { id: 25682, name: "TERRA"        },
  { id: 27875, name: "AURA"         },
];

export interface TleRecord {
  norad_id: number;
  name: string;
  lat_deg: number;
  lon_deg: number;
  alt_km: number;
  velocity_kms: number;
  eci: { x: number; y: number; z: number };
}

export interface TleResponse {
  records: TleRecord[];
  count: number;
  propagated_at: string;
}

interface TleApiResponse {
  satelliteId: number;
  name: string;
  line1: string;
  line2: string;
}

async function fetchAndPropagate(
  noradId: number,
  label: string,
  now: Date,
  gmst: number
): Promise<TleRecord | null> {
  try {
    const res = await fetch(`https://tle.ivanstanojevic.me/api/tle/${noradId}`, {
      next: { revalidate: 600 },
      headers: { "User-Agent": "ORION-Space-Command/2.0" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;

    const data = (await res.json()) as TleApiResponse;
    const { line1, line2 } = data;

    if (!line1?.startsWith("1 ") || !line2?.startsWith("2 ")) return null;

    const satrec  = satellite.twoline2satrec(line1, line2);
    const posVel  = satellite.propagate(satrec, now);

    if (!posVel || posVel.position === false || typeof posVel.position === "boolean") return null;
    if (!posVel.velocity || typeof posVel.velocity === "boolean") return null;

    const pos = posVel.position as satellite.EciVec3<number>;
    const vel = posVel.velocity as satellite.EciVec3<number>;

    const velocityKms = Math.sqrt(vel.x ** 2 + vel.y ** 2 + vel.z ** 2);
    const geodetic    = satellite.eciToGeodetic(pos, gmst);

    return {
      norad_id:     noradId,
      name:         label,
      lat_deg:      Math.round(satellite.degreesLat(geodetic.latitude)   * 100) / 100,
      lon_deg:      Math.round(satellite.degreesLong(geodetic.longitude) * 100) / 100,
      alt_km:       Math.round(geodetic.height * 10) / 10,
      velocity_kms: Math.round(velocityKms * 100) / 100,
      eci: {
        x: Math.round(pos.x * 10) / 10,
        y: Math.round(pos.y * 10) / 10,
        z: Math.round(pos.z * 10) / 10,
      },
    };
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const now  = new Date();
    const gmst = satellite.gstime(now);

    const results = await Promise.all(
      TARGETS.map(({ id, name }) => fetchAndPropagate(id, name, now, gmst))
    );

    const records: TleRecord[] = results.filter((r): r is TleRecord => r !== null);

    if (records.length === 0) {
      throw new Error("All TLE fetches failed — upstream API may be unavailable");
    }

    return NextResponse.json<TleResponse>({
      records,
      count: records.length,
      propagated_at: now.toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: msg, records: [], count: 0, propagated_at: new Date().toISOString() },
      { status: 502 }
    );
  }
}
