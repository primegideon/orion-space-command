/**
 * /api/dsn — NASA Deep Space Network Now (live)
 *
 * Fetches the real-time XML feed from NASA Eyes DSN and parses it into a
 * structured JSON response consumed by the GroundRelayGrid component.
 *
 * Source: https://eyes.nasa.gov/dsn/data/dsn.xml (updates every ~5 s)
 *
 * XML structure:
 *   <dsn>
 *     <station name="gdscc|mdscc|cdscc" friendlyName="…" timeUTC="…" />
 *     <dish name="DSS14" azimuthAngle elevationAngle windSpeed activity>
 *       <upSignal   active dataRate frequency band power spacecraft spacecraftID />
 *       <downSignal active dataRate frequency band power spacecraft spacecraftID />
 *       <target     name id uplegRange downlegRange rtlt />
 *     </dish>
 *     …
 *     <timestamp>…</timestamp>
 *   </dsn>
 *
 * Dishes follow the station element that precedes them in document order.
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DSN_URL = "https://eyes.nasa.gov/dsn/data/dsn.xml";

/* ── Known DSN complex coordinates ────────────────────────────────────────*/
const COMPLEX_META: Record<string, { lat: number; lng: number; location: string }> = {
  gdscc: { lat: 35.43,  lng: -116.89, location: "Goldstone, CA, USA"    },
  mdscc: { lat: 40.43,  lng: -4.25,   location: "Robledo, Spain"         },
  cdscc: { lat: -35.40, lng:  148.98, location: "Tidbinbilla, Australia" },
};

/* ── Public types exported for the client component ───────────────────────*/

export type SignalDirection = "uplink" | "downlink";

export interface DsnSignal {
  direction:  SignalDirection;
  active:     boolean;
  dataRate:   number;        // bps from XML; we convert to kbps/Mbps in UI
  band:       string;        // X, S, K, Ka, L, UHF…
  spacecraft: string;        // e.g. "ORX", "JWST"
  power:      number;        // dBm transmit / received power
}

export interface DsnTarget {
  name:          string;      // spacecraft abbreviation
  uplegRange:    number | null;   // km, -1 = unknown
  downlegRange:  number | null;
  rtlt:          number | null;   // round-trip light-time seconds, -1 = unknown
}

export interface DsnDish {
  name:           string;     // e.g. "DSS14"
  complex:        string;     // "gdscc" | "mdscc" | "cdscc"
  complexName:    string;     // friendly, e.g. "Goldstone"
  lat:            number;
  lng:            number;
  location:       string;
  azimuth:        number;
  elevation:      number;
  windSpeed:      number | null;
  activity:       string;
  signals:        DsnSignal[];
  targets:        DsnTarget[];
  /** Derived: true if any signal is active */
  isActive:       boolean;
  /** Derived: primary spacecraft name (first target, or "—") */
  spacecraft:     string;
  /** Derived: dominant direction for a single-status label */
  status:         "UPLINK" | "DOWNLINK" | "BOTH" | "STANDBY" | "MAINTENANCE";
  /** Derived: highest active downlink data rate in bps */
  maxDownlinkBps: number;
  /** Derived: highest active uplink data rate in bps */
  maxUplinkBps:   number;
  /** Derived: primary RF band label */
  primaryBand:    string;
}

export interface DsnStation {
  id:          string;   // "gdscc" | "mdscc" | "cdscc"
  name:        string;   // "Goldstone" | "Madrid" | "Canberra"
  lat:         number;
  lng:         number;
  location:    string;
  timeUTC:     number;
  dishes:      DsnDish[];
}

export interface DsnResponse {
  stations:    DsnStation[];
  /** All dishes across all stations, sorted active first */
  dishes:      DsnDish[];
  timestamp:   number;
  fetched_at:  string;
  source:      "nasa-dsn";
}

/* ── Minimal XML attribute parser (no external deps) ───────────────────────*/

/** Extract all occurrences of a tag and their attribute maps from raw XML */
function parseElements(xml: string, tag: string): Record<string, string>[] {
  const results: Record<string, string>[] = [];
  // Match both self-closing and opening tags
  const tagRe = new RegExp(`<${tag}\\s([^>]*?)(?:/>|>)`, "gs");
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(xml)) !== null) {
    const attrStr = m[1];
    const attrs: Record<string, string> = {};
    const attrRe = /(\w+)="([^"]*)"/g;
    let a: RegExpExecArray | null;
    while ((a = attrRe.exec(attrStr)) !== null) {
      attrs[a[1]] = a[2];
    }
    results.push(attrs);
  }
  return results;
}

/** Extract text content of a tag */
function parseText(xml: string, tag: string): string | null {
  const m = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`).exec(xml);
  return m ? m[1].trim() : null;
}

/** Split XML into per-station segments preserving dish membership */
function splitIntoStationBlocks(xml: string): Array<{ stationAttrs: Record<string, string>; block: string }> {
  const blocks: Array<{ stationAttrs: Record<string, string>; block: string }> = [];
  // Find all station elements and their positions
  const stationRe = /<station\s([^>]*?)(?:\/>|>)/g;
  let match: RegExpExecArray | null;
  const stations: Array<{ attrs: Record<string, string>; index: number }> = [];

  while ((match = stationRe.exec(xml)) !== null) {
    const attrs: Record<string, string> = {};
    const attrRe = /(\w+)="([^"]*)"/g;
    let a: RegExpExecArray | null;
    while ((a = attrRe.exec(match[1])) !== null) attrs[a[1]] = a[2];
    stations.push({ attrs, index: match.index + match[0].length });
  }

  for (let i = 0; i < stations.length; i++) {
    const start = stations[i].index;
    // Slice from this station element to just before the next station element
    const nextStart = i + 1 < stations.length
      ? xml.lastIndexOf("<station", stations[i + 1].index)
      : xml.length;
    blocks.push({ stationAttrs: stations[i].attrs, block: xml.slice(start, nextStart) });
  }
  return blocks;
}

/** Parse a single dish XML block (the full <dish …>…</dish> element) */
function parseDish(
  dishXml: string,
  dishAttrs: Record<string, string>,
  complex: string,
): DsnDish {
  const complexMeta = COMPLEX_META[complex] ?? { lat: 0, lng: 0, location: "Unknown" };
  const complexName = complex === "gdscc" ? "Goldstone" : complex === "mdscc" ? "Madrid" : "Canberra";

  const upSignals    = parseElements(dishXml, "upSignal");
  const downSignals  = parseElements(dishXml, "downSignal");
  const targetEls    = parseElements(dishXml, "target");

  const signals: DsnSignal[] = [
    ...upSignals.map((s) => ({
      direction: "uplink" as const,
      active:    s.active === "true",
      dataRate:  parseFloat(s.dataRate || "0") || 0,
      band:      s.band || "?",
      spacecraft: s.spacecraft || "",
      power:     parseFloat(s.power || "0") || 0,
    })),
    ...downSignals.map((s) => ({
      direction: "downlink" as const,
      active:    s.active === "true",
      dataRate:  parseFloat(s.dataRate || "0") || 0,
      band:      s.band || "?",
      spacecraft: s.spacecraft || "",
      power:     parseFloat(s.power || "0") || 0,
    })),
  ];

  const targets: DsnTarget[] = targetEls.map((t) => ({
    name:         t.name || "?",
    uplegRange:   t.uplegRange   !== undefined ? parseFloat(t.uplegRange)   : null,
    downlegRange: t.downlegRange !== undefined ? parseFloat(t.downlegRange) : null,
    rtlt:         t.rtlt         !== undefined ? parseFloat(t.rtlt)         : null,
  }));

  const activeSignals   = signals.filter((s) => s.active);
  const hasUplink       = activeSignals.some((s) => s.direction === "uplink");
  const hasDownlink     = activeSignals.some((s) => s.direction === "downlink");
  const isActive        = activeSignals.length > 0;

  const maxDownlinkBps  = Math.max(0, ...signals.filter(s => s.direction === "downlink" && s.active).map(s => s.dataRate));
  const maxUplinkBps    = Math.max(0, ...signals.filter(s => s.direction === "uplink"   && s.active).map(s => s.dataRate));

  // Primary spacecraft: first non-DSN, non-empty target name
  const primaryTarget   = targets.find(t => t.name && t.name !== "DSN") ?? targets[0];
  const spacecraft      = primaryTarget?.name ?? "—";

  // Status label
  const isMaintenance   = (dishAttrs.activity ?? "").toLowerCase().includes("engineering") ||
                          (dishAttrs.activity ?? "").toLowerCase().includes("maintenance");
  let status: DsnDish["status"] = "STANDBY";
  if (isMaintenance && !isActive)       status = "MAINTENANCE";
  else if (hasUplink && hasDownlink)    status = "BOTH";
  else if (hasUplink)                   status = "UPLINK";
  else if (hasDownlink)                 status = "DOWNLINK";
  else if (isMaintenance)               status = "MAINTENANCE";

  // Primary band: prefer active signal band, else any
  const activeBand      = activeSignals[0]?.band ?? signals[0]?.band ?? "?";
  const primaryBand     = activeBand === "?" ? (dishAttrs.activity ? "" : "?") : `${activeBand}-band`;

  return {
    name:           dishAttrs.name  || "?",
    complex,
    complexName,
    lat:            complexMeta.lat,
    lng:            complexMeta.lng,
    location:       complexMeta.location,
    azimuth:        parseFloat(dishAttrs.azimuthAngle   || "0") || 0,
    elevation:      parseFloat(dishAttrs.elevationAngle || "0") || 0,
    windSpeed:      dishAttrs.windSpeed ? (parseFloat(dishAttrs.windSpeed) || null) : null,
    activity:       dishAttrs.activity || "",
    signals,
    targets,
    isActive,
    spacecraft,
    status,
    maxDownlinkBps,
    maxUplinkBps,
    primaryBand,
  };
}

/* ── Main handler ──────────────────────────────────────────────────────────*/

export async function GET() {
  try {
    const res = await fetch(DSN_URL, {
      // DSN updates every ~5 s; we cache 15 s to avoid hammering the endpoint
      next: { revalidate: 15 },
      headers: { "User-Agent": "ORION-SpaceCommand/2.0" },
    });

    if (!res.ok) throw new Error(`NASA DSN returned HTTP ${res.status}`);

    const xml = await res.text();

    // Global timestamp
    const tsText      = parseText(xml, "timestamp");
    const timestamp   = tsText ? parseInt(tsText, 10) : Date.now();

    // Split XML into per-station blocks
    const stationBlocks = splitIntoStationBlocks(xml);

    const stations: DsnStation[] = [];
    const allDishes: DsnDish[] = [];

    for (const { stationAttrs, block } of stationBlocks) {
      const complexId  = stationAttrs.name || "";
      const meta       = COMPLEX_META[complexId] ?? { lat: 0, lng: 0, location: "Unknown" };
      const timeUTC    = parseInt(stationAttrs.timeUTC || "0", 10) || timestamp;
      const friendlyName = stationAttrs.friendlyName ||
        (complexId === "gdscc" ? "Goldstone" : complexId === "mdscc" ? "Madrid" : "Canberra");

      // Extract all <dish …>…</dish> blocks within this station's segment
      const dishRe = /<dish\s([^>]*?)>([\s\S]*?)<\/dish>/g;
      const dishes: DsnDish[] = [];
      let dm: RegExpExecArray | null;

      while ((dm = dishRe.exec(block)) !== null) {
        const attrStr  = dm[1];
        const dishBody = dm[2];
        const attrs: Record<string, string> = {};
        const aRe      = /(\w+)="([^"]*)"/g;
        let a: RegExpExecArray | null;
        while ((a = aRe.exec(attrStr)) !== null) attrs[a[1]] = a[2];

        const dish = parseDish(dishBody, attrs, complexId);
        dishes.push(dish);
        allDishes.push(dish);
      }

      stations.push({
        id:       complexId,
        name:     friendlyName,
        lat:      meta.lat,
        lng:      meta.lng,
        location: meta.location,
        timeUTC,
        dishes,
      });
    }

    // Sort: active dishes first, then by name
    allDishes.sort((a, b) => {
      if (a.isActive && !b.isActive) return -1;
      if (!a.isActive && b.isActive) return  1;
      return a.name.localeCompare(b.name);
    });

    const payload: DsnResponse = {
      stations,
      dishes:     allDishes,
      timestamp,
      fetched_at: new Date().toISOString(),
      source:     "nasa-dsn",
    };

    return NextResponse.json(payload);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg, source: "nasa-dsn" }, { status: 502 });
  }
}
