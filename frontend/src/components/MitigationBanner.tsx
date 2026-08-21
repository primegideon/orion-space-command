"use client";

import { useState, useEffect } from "react";
import type { ForecasterData, FlareItem } from "./ForecasterPanel";
import type { SentinelData, AsteroidItem } from "./SentinelPanel";

interface Props {
  forecaster: ForecasterData | null;
  sentinel: SentinelData | null;
}

/* ── Thresholds ─────────────────────────────────────────────────────────────
 *
 *  FLARE SCALE (NOAA)
 *    X-class (any)     → SEVERE   (R3–R5 radio blackout, S2+ radiation)
 *    M5–M9.9           → ELEVATED (R2 blackout, satellite drag elevated)
 *    M1–M4.9           → WATCH    (R1 minor blackout, monitoring warranted)
 *    C-class and below → no banner
 *
 *  ASTEROID / PHO SCALE
 *    PHO + miss < 1 LD (384,400 km) → CRITICAL  (Torino scale ≥ 2 analog)
 *    PHO + miss 1–5 LD               → SEVERE    (insurance watch)
 *    PHO + any distance               → ELEVATED  (standard PHO protocol)
 *    Non-PHO, miss < 500,000 km,
 *      diameter > 0.14 km (Tunguska-class) → WATCH
 *    Any object, velocity > 100,000 km/h
 *      and miss < 1,000,000 km          → WATCH    (kinetic energy concern)
 *
 *  COMBINED (flare + asteroid active simultaneously) → bumped one level up
 *    WATCH + WATCH   → ELEVATED
 *    ELEVATED + any  → SEVERE
 *    SEVERE + any    → CRITICAL
 * ──────────────────────────────────────────────────────────────────────────*/

const ONE_LD = 384_400;      // km — 1 lunar distance
const FIVE_LD = 1_922_000;   // km — 5 lunar distances
const TUNGUSKA_KM = 0.14;    // km — ~140 m diameter threshold
const HIGH_VEL = 100_000;    // km/h
const HIGH_VEL_DIST = 1_000_000; // km

type SevLevel = "WATCH" | "ELEVATED" | "SEVERE" | "CRITICAL";

interface SevInfo {
  level: SevLevel;
  color: string;
  icon: string;
  flareMsg: string | null;
  asteroidMsg: string | null;
}

function flareLevel(items: FlareItem[]): { level: SevLevel | null; trigger: FlareItem | null } {
  // Find the worst flare
  let worst: FlareItem | null = null;
  let worstScore = 0;

  for (const f of items) {
    const t = (f.class_type ?? "").toUpperCase();
    const letter = t.charAt(0);
    const num = parseFloat(t.slice(1)) || 0;
    let score = 0;
    if (letter === "X") score = 1000 + num;
    else if (letter === "M") score = 100 + num;
    else if (letter === "C") score = 10 + num;
    else if (letter === "B") score = 1 + num;
    if (score > worstScore) { worstScore = score; worst = f; }
  }

  if (!worst) return { level: null, trigger: null };
  const t = (worst.class_type ?? "").toUpperCase();
  const letter = t.charAt(0);
  const num = parseFloat(t.slice(1)) || 0;

  if (letter === "X") return { level: "SEVERE", trigger: worst };
  if (letter === "M" && num >= 5) return { level: "ELEVATED", trigger: worst };
  if (letter === "M" && num >= 1) return { level: "WATCH", trigger: worst };
  return { level: null, trigger: null };
}

function asteroidLevel(items: AsteroidItem[]): { level: SevLevel | null; trigger: AsteroidItem | null } {
  let worstLevel: SevLevel | null = null;
  let worstItem: AsteroidItem | null = null;

  const rank: Record<SevLevel, number> = { WATCH: 1, ELEVATED: 2, SEVERE: 3, CRITICAL: 4 };

  for (const a of items) {
    const dist = a.miss_distance_km ?? Infinity;
    const diam = a.estimated_diameter_km_max ?? 0;
    const vel  = a.relative_velocity_kmh ?? 0;
    const pho  = a.is_potentially_hazardous;

    let level: SevLevel | null = null;

    if (pho && dist < ONE_LD)          level = "CRITICAL";
    else if (pho && dist < FIVE_LD)    level = "SEVERE";
    else if (pho)                      level = "ELEVATED";
    else if (dist < 500_000 && diam > TUNGUSKA_KM) level = "WATCH";
    else if (vel > HIGH_VEL && dist < HIGH_VEL_DIST) level = "WATCH";

    if (level && (!worstLevel || rank[level] > rank[worstLevel])) {
      worstLevel = level;
      worstItem = a;
    }
  }

  return { level: worstLevel, trigger: worstItem };
}

function bump(level: SevLevel): SevLevel {
  if (level === "WATCH")    return "ELEVATED";
  if (level === "ELEVATED") return "SEVERE";
  return "CRITICAL";
}

function combinedLevel(f: SevLevel | null, a: SevLevel | null): SevLevel | null {
  if (!f && !a) return null;
  if (!f) return a;
  if (!a) return f;
  // Both active — take the higher and bump it
  const rank: Record<SevLevel, number> = { WATCH: 1, ELEVATED: 2, SEVERE: 3, CRITICAL: 4 };
  const higher = rank[f] >= rank[a] ? f : a;
  return bump(higher);
}

const LEVEL_STYLE: Record<SevLevel, { color: string; bg: string; icon: string }> = {
  WATCH:    { color: "var(--amber)", bg: "251,191,36",  icon: "◈" },
  ELEVATED: { color: "var(--amber)", bg: "251,191,36",  icon: "◆" },
  SEVERE:   { color: "#fb923c",      bg: "251,146,60",  icon: "▲" },
  CRITICAL: { color: "var(--red)",   bg: "248,113,113", icon: "⬡" },
};

function buildSevInfo(
  forecaster: ForecasterData | null,
  sentinel: SentinelData | null
): SevInfo | null {
  const { level: fLevel, trigger: fTrigger } = flareLevel(forecaster?.items ?? []);
  const { level: aLevel, trigger: aTrigger } = asteroidLevel(sentinel?.items ?? []);

  const final = combinedLevel(fLevel, aLevel);
  if (!final) return null;

  const style = LEVEL_STYLE[final];

  // Flare message
  let flareMsg: string | null = null;
  if (fTrigger) {
    const t = (fTrigger.class_type ?? "").toUpperCase();
    const letter = t.charAt(0);
    const peak = fTrigger.peak_time?.slice(0, 16).replace("T", " ") ?? "—";
    if (letter === "X") {
      flareMsg = `X-class flare ${fTrigger.class_type} peaked at ${peak} — R3–R5 HF blackout, radiation storm possible.`;
    } else {
      const num = parseFloat(t.slice(1)) || 0;
      if (num >= 5) {
        flareMsg = `M${num}-class flare ${fTrigger.class_type} peaked at ${peak} — R2 HF blackout, satellite drag elevated.`;
      } else {
        flareMsg = `M${num}-class flare ${fTrigger.class_type} peaked at ${peak} — R1 minor blackout, monitoring warranted.`;
      }
    }
  }

  // Asteroid message
  let asteroidMsg: string | null = null;
  if (aTrigger) {
    const dist = aTrigger.miss_distance_km?.toLocaleString("en-US") ?? "—";
    const ld   = aTrigger.miss_distance_km ? (aTrigger.miss_distance_km / ONE_LD).toFixed(2) : "—";
    const diam = aTrigger.estimated_diameter_km_max
      ? `${(aTrigger.estimated_diameter_km_max * 1000).toFixed(0)} m`
      : "unknown size";
    const vel  = aTrigger.relative_velocity_kmh
      ? `${aTrigger.relative_velocity_kmh.toLocaleString("en-US", { maximumFractionDigits: 0 })} km/h`
      : "unknown velocity";
    if (aTrigger.is_potentially_hazardous) {
      asteroidMsg = `PHO ${aTrigger.name} — miss distance ${dist} km (${ld} LD), ${diam}, ${vel}. Insurance risk elevated.`;
    } else {
      asteroidMsg = `${aTrigger.name} — close approach ${dist} km, ${diam} at ${vel}. Monitoring active.`;
    }
  }

  return { level: final, color: style.color, icon: style.icon, flareMsg, asteroidMsg };
}

export default function MitigationBanner({ forecaster, sentinel }: Props) {
  const [dismissed, setDismissed] = useState(false);
  const info = buildSevInfo(forecaster, sentinel);

  // Reset whenever new triggering data arrives
  useEffect(() => {
    if (info) setDismissed(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forecaster, sentinel]);

  if (!info || dismissed) return null;

  const style = LEVEL_STYLE[info.level];
  const messages = [info.flareMsg, info.asteroidMsg].filter(Boolean) as string[];

  return (
    <div
      className="flex items-start gap-3 px-4 py-3 rounded-xl font-mono text-xs animate-fade-in"
      style={{
        background: `rgba(${style.bg},0.10)`,
        border: `1px solid ${style.color}55`,
        color: style.color,
      }}
    >
      {/* Blinking icon */}
      <span className="shrink-0 text-base leading-none mt-0.5 animate-pulse" aria-hidden>
        {style.icon}
      </span>

      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <span className="font-bold tracking-widest uppercase">
          [{info.level}] Space Weather Alert
        </span>
        {messages.map((msg, i) => (
          <span key={i} className="opacity-85 break-words leading-relaxed">{msg}</span>
        ))}
      </div>

      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss alert"
        className="shrink-0 ml-2 opacity-60 hover:opacity-100 transition-opacity leading-none text-base"
      >
        ✕
      </button>
    </div>
  );
}
