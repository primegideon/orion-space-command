/**
 * /api/solarwind — Live Real-Time Solar Wind Data
 *
 * Uses NOAA Space Weather Prediction Center RTSW (Real-Time Solar Wind) feeds:
 *   - rtsw_mag_1m.json   → Bz, Bt magnetic field (nT) — IMAP satellite
 *   - rtsw_wind_1m.json  → Proton density (p/cm³), solar wind speed (km/s)
 *
 * Both return arrays of JSON objects; last element is most recent.
 * Cache: 60 seconds
 */
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAG_URL  = "https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_1m.json";
const WIND_URL = "https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json";

interface RtswMagRow {
  time_tag:  string;
  active:    boolean;
  source:    string;
  bt:        number | null;
  bx_gsm:    number | null;
  by_gsm:    number | null;
  bz_gsm:    number | null;
}

interface RtswWindRow {
  time_tag:        string;
  active:          boolean;
  source:          string;
  proton_speed:    number | null;
  proton_density:  number | null;
}

function toNum(v: number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && (isNaN(v) || v <= -9999)) return null;
  return v;
}

export interface SolarWindData {
  bz_nT:          number | null;
  bt_nT:          number | null;
  proton_density: number | null;
  speed_kms:      number | null;
  timestamp:      string | null;
  source:         "noaa-rtsw";
  error?:         string;
}

export async function GET() {
  try {
    const [magResult, windResult] = await Promise.allSettled([
      fetch(MAG_URL,  { next: { revalidate: 60 }, signal: AbortSignal.timeout(10_000) }),
      fetch(WIND_URL, { next: { revalidate: 60 }, signal: AbortSignal.timeout(10_000) }),
    ]);

    let bz: number | null = null;
    let bt: number | null = null;
    let timestamp: string | null = null;

    if (magResult.status === "fulfilled" && magResult.value.ok) {
      const rows = (await magResult.value.json()) as RtswMagRow[];
      // Find last row where active = true, otherwise use absolute last row
      const active = [...rows].reverse().find(r => r.active) ?? rows[rows.length - 1];
      if (active) {
        timestamp = active.time_tag;
        bz = toNum(active.bz_gsm);
        bt = toNum(active.bt);
        if (bz !== null) bz = Math.round(bz * 10) / 10;
        if (bt !== null) bt = Math.round(bt * 10) / 10;
      }
    }

    let density: number | null = null;
    let speed:   number | null = null;

    if (windResult.status === "fulfilled" && windResult.value.ok) {
      const rows = (await windResult.value.json()) as RtswWindRow[];
      const active = [...rows].reverse().find(r => r.active) ?? rows[rows.length - 1];
      if (active) {
        density = toNum(active.proton_density);
        speed   = toNum(active.proton_speed);
        if (density !== null) density = Math.round(density * 10) / 10;
        if (speed   !== null) speed   = Math.round(speed);
      }
    }

    return NextResponse.json<SolarWindData>({
      bz_nT:          bz,
      bt_nT:          bt,
      proton_density: density,
      speed_kms:      speed,
      timestamp,
      source: "noaa-rtsw",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json<SolarWindData>(
      { bz_nT: null, bt_nT: null, proton_density: null, speed_kms: null, timestamp: null, source: "noaa-rtsw", error: msg },
      { status: 502 }
    );
  }
}
