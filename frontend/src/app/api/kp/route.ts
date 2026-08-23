/**
 * /api/kp — Live NOAA SWPC Planetary Kp-Index
 *
 * NOAA endpoint returns an array of objects:
 * [{ "time_tag": "2025-...", "Kp": 1.33, "a_running": 5, "station_count": 8 }, ...]
 */
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NOAA_KP_URL =
  "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json";

export interface KpReading {
  time_tag: string;
  kp: number;
}

export interface KpResponse {
  current: KpReading;
  history: KpReading[];         // last 8 readings (~24 h)
  status: "NOMINAL" | "ELEVATED" | "STORM" | "SEVERE";
  source: "noaa-swpc";
  fetched_at: string;
}

// NOAA object shape
interface NoaaKpRecord {
  time_tag: string;
  Kp: number | string;
  a_running?: number;
  station_count?: number;
}

function classifyKp(kp: number): KpResponse["status"] {
  if (kp >= 7) return "SEVERE";
  if (kp >= 5) return "STORM";
  if (kp >= 4) return "ELEVATED";
  return "NOMINAL";
}

export async function GET() {
  try {
    const res = await fetch(NOAA_KP_URL, {
      next: { revalidate: 180 },
      headers: { "User-Agent": "ORION-SpaceCommand/2.0" },
    });

    if (!res.ok) throw new Error(`NOAA returned ${res.status}`);

    const raw: unknown = await res.json();

    if (!Array.isArray(raw) || raw.length === 0) {
      throw new Error("Unexpected NOAA response shape");
    }

    // Detect format: old = array-of-arrays (first el is string header),
    // new = array-of-objects with "Kp" key
    let readings: KpReading[];

    if (Array.isArray(raw[0])) {
      // Legacy array-of-arrays: [["time_tag","Kp"], ["2025-...","3.33"], ...]
      const rows = (raw as string[][]).slice(1).filter((r) => r.length >= 2 && r[1] !== null);
      readings = rows
        .map((r) => ({ time_tag: r[0], kp: parseFloat(r[1]) }))
        .filter((r) => !isNaN(r.kp));
    } else {
      // Current array-of-objects: [{ "time_tag": "...", "Kp": 1.33 }, ...]
      readings = (raw as NoaaKpRecord[])
        .map((r) => ({ time_tag: r.time_tag, kp: parseFloat(String(r.Kp)) }))
        .filter((r) => r.time_tag && !isNaN(r.kp));
    }

    if (readings.length === 0) throw new Error("No valid Kp readings");

    const current = readings[readings.length - 1];
    const history = readings.slice(-8);

    const payload: KpResponse = {
      current,
      history,
      status: classifyKp(current.kp),
      source: "noaa-swpc",
      fetched_at: new Date().toISOString(),
    };

    return NextResponse.json(payload);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: msg, source: "noaa-swpc" },
      { status: 502 }
    );
  }
}
