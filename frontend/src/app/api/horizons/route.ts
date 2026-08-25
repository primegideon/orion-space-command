/**
 * /api/horizons — JPL Horizons High-Precision Heliocentric State Vectors
 *
 * Queries the NASA JPL Horizons System REST API for heliocentric Cartesian
 * state vectors (X, Y, Z in AU; VX, VY, VZ in km/s) for a given small body,
 * keyed by its SPKID (e.g. "2465633" for an asteroid).
 *
 * Usage: GET /api/horizons?spkid=2465633
 *
 * The Horizons API returns a fixed-width text block embedded in a JSON
 * "result" string; vectors appear between $$SOE and $$EOE markers.
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface HorizonsData {
  spkid: string;
  body_name: string;
  epoch_jd: string;
  x_au: number;
  y_au: number;
  z_au: number;
  vx_kms: number;
  vy_kms: number;
  vz_kms: number;
  source: "jpl-horizons";
  error?: string;
}

/** Build the Horizons API URL for heliocentric vectors at today's epoch */
/**
 * Build the Horizons query.
 * `name` should be the asteroid designation e.g. "2016 XJ" or "(2016 XJ)".
 * Horizons accepts small-body designations directly as the COMMAND value.
 */
function buildHorizonsUrl(name: string): string {
  const today = new Date();
  const start = today.toISOString().slice(0, 10);
  const stopDate = new Date(today.getTime() + 86_400_000);
  const stop = stopDate.toISOString().slice(0, 10);

  // NeoWs names can be "523609 (2005 PJ2)" or "(2016 XJ)" or "2016 XJ"
  // Horizons wants just the designation inside parens, or the plain name.
  // Strategy: if there are parens, extract the LAST parenthesised token.
  const parenMatch = name.match(/\(([^)]+)\)\s*$/);
  const designation = parenMatch ? parenMatch[1].trim() : name.replace(/^\s*\(|\)\s*$/g, "").trim();

  const params = new URLSearchParams({
    format:       "json",
    COMMAND:      `'${designation}'`,
    OBJ_DATA:     "NO",
    MAKE_EPHEM:   "YES",
    EPHEM_TYPE:   "VECTORS",
    CENTER:       "500@10",
    START_TIME:   start,
    STOP_TIME:    stop,
    STEP_SIZE:    "1d",
    VEC_TABLE:    "2",
    CSV_FORMAT:   "NO",
  });

  return `https://ssd.jpl.nasa.gov/api/horizons.api?${params.toString()}`;
}

/**
 * Extract body name from the Horizons result preamble.
 * Looks for "Target body name: <name>" in the text.
 */
function extractBodyName(result: string): string {
  const match = result.match(/Target body name:\s*(.+?)\s*(?:\{|$)/m);
  return match ? match[1].trim() : "Unknown body";
}

/**
 * Parse the first state-vector epoch between $$SOE / $$EOE.
 *
 * Actual Horizons VEC_TABLE=2 format (CSV_FORMAT=NO):
 *   2461277.500000000 = A.D. 2026-Aug-25 00:00:00.0000 TDB
 *    X = 2.106314424986716E+07 Y =-4.425297238412986E+08 Z =-6.876146736493140E+06
 *    VX= 1.729913039798875E+01 VY= 4.067621971649389E+00 VZ=-1.861829481723865E-02
 *    LT= ...
 *
 * The values follow "X =", "Y =", "Z =", "VX=", "VY=", "VZ=" labels.
 * Units: km and km/s — convert X/Y/Z to AU (divide by 149,597,870.7).
 */
const KM_PER_AU = 149_597_870.7;

function parseVectors(result: string): {
  epoch_jd: string;
  x_au: number; y_au: number; z_au: number;
  vx_kms: number; vy_kms: number; vz_kms: number;
} | null {
  const soeIdx = result.indexOf("$$SOE");
  const eoeIdx = result.indexOf("$$EOE");
  if (soeIdx === -1 || eoeIdx === -1) return null;

  // Take only the first epoch block (up to the second JD line or $$EOE)
  const block = result.slice(soeIdx + 5, eoeIdx).trim();

  // Extract JD from the first line: "2461277.500000000 = A.D. ..."
  const jdMatch = block.match(/^([\d.]+)\s*=/m);
  if (!jdMatch) return null;
  const epoch_jd = jdMatch[1];

  // Extract named values: "X = -1.23E+07" or "VX= 1.23E+01" etc.
  function extractVal(label: string): number | null {
    // Match label followed by optional space and = then optional space then number
    const re = new RegExp(label + "\\s*=\\s*([+-]?[\\d.]+E[+-]?\\d+|[+-]?[\\d.]+)", "i");
    const m = block.match(re);
    return m ? parseFloat(m[1]) : null;
  }

  const xKm  = extractVal("X");
  const yKm  = extractVal("Y");
  const zKm  = extractVal("Z");
  const vx   = extractVal("VX");
  const vy   = extractVal("VY");
  const vz   = extractVal("VZ");

  if (xKm === null || yKm === null || zKm === null ||
      vx  === null || vy  === null || vz  === null) return null;

  return {
    epoch_jd,
    x_au:   xKm / KM_PER_AU,
    y_au:   yKm / KM_PER_AU,
    z_au:   zKm / KM_PER_AU,
    vx_kms: vx,
    vy_kms: vy,
    vz_kms: vz,
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  // Accept either ?name=2016+XJ or legacy ?spkid=... (falls back to name)
  const name = (searchParams.get("name") ?? searchParams.get("spkid"))?.trim();

  if (!name) {
    return NextResponse.json<HorizonsData>(
      { spkid: "", body_name: "", epoch_jd: "", x_au: 0, y_au: 0, z_au: 0, vx_kms: 0, vy_kms: 0, vz_kms: 0, source: "jpl-horizons", error: "Missing name query parameter" },
      { status: 400 }
    );
  }

  try {
    const url = buildHorizonsUrl(name);

    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      throw new Error(`JPL Horizons returned ${res.status}`);
    }

    const json = (await res.json()) as { result?: string; error?: string };

    if (json.error) {
      throw new Error(`Horizons error: ${json.error}`);
    }

    const result = json.result ?? "";
    const bodyName = extractBodyName(result);
    const vectors = parseVectors(result);

    if (!vectors) {
      throw new Error("Could not parse state vectors from Horizons response — body may not be found or epoch is outside valid range");
    }

    const payload: HorizonsData = {
      spkid: name,
      body_name:  bodyName,
      epoch_jd:   vectors.epoch_jd,
      x_au:       Math.round(vectors.x_au   * 1e6) / 1e6,
      y_au:       Math.round(vectors.y_au   * 1e6) / 1e6,
      z_au:       Math.round(vectors.z_au   * 1e6) / 1e6,
      vx_kms:     Math.round(vectors.vx_kms * 1000) / 1000,
      vy_kms:     Math.round(vectors.vy_kms * 1000) / 1000,
      vz_kms:     Math.round(vectors.vz_kms * 1000) / 1000,
      source:     "jpl-horizons",
    };

    return NextResponse.json(payload);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json<HorizonsData>(
      { spkid: name ?? "", body_name: "", epoch_jd: "", x_au: 0, y_au: 0, z_au: 0, vx_kms: 0, vy_kms: 0, vz_kms: 0, source: "jpl-horizons", error: msg },
      { status: 502 }
    );
  }
}
