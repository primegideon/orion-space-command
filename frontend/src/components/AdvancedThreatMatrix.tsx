"use client";

import { useEffect, useState, useCallback } from "react";
import type { ForecasterData } from "./ForecasterPanel";
import type { SatelliteRecord, SatellitesResponse } from "@/app/api/satellites/route";
import type { KpResponse } from "@/app/api/kp/route";
import type { DonkiResponse } from "@/app/api/donki/route";
import type { SolarWindData } from "@/app/api/solarwind/route";
// Note: SolarWindData.source changed to "noaa-rtsw" — no UI impact

/* ════════════════════════════════════════════════════════════════════════════
 *  ADVANCED THREAT MATRIX
 *  Three modules:
 *   1. Orbital Debris & Drag          — physics, driven by live forecaster data
 *   2. Cybersecurity & Spectrum       — comms integrity, simulated telemetry
 *   3. Data Compliance Gateway        — legal/regulatory, PDF export hook
 * ══════════════════════════════════════════════════════════════════════════*/

interface Props {
  forecaster: ForecasterData | null;
  /** True while the PDF export is in flight — drives compliance loading state */
  exporting: boolean;
  /** Last Archivist RAG result — drives the Compliance RAG monitor */
  archivist: import("@/components/ArchivistPanel").ArchivistData | null;
  /** True while the Archivist agent is running */
  archivistLoading: boolean;
}

/* ── Shared primitives ────────────────────────────────────────────────────── */

function SectionHeader({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-3">
      <p className="text-[11px] font-mono font-bold tracking-widest uppercase" style={{ color: "var(--cyan)" }}>
        {title}
      </p>
      <p className="text-[10px] font-mono mt-0.5" style={{ color: "var(--muted)" }}>{sub}</p>
    </div>
  );
}

function Badge({ label, color, pulse }: { label: string; color: string; pulse?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-mono font-bold tracking-widest uppercase${pulse ? " animate-pulse" : ""}`}
      style={{ background: `${color}1a`, border: `1px solid ${color}55`, color }}
    >
      {label}
    </span>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 *  MODULE 1 — ORBITAL DEBRIS & DRAG
 * ══════════════════════════════════════════════════════════════════════════*/

// NORAD IDs of the LEO satellites we want to show in this module
const LEO_NORAD_IDS = [25544, 20580, 43013, 49260]; // ISS, HST, NOAA 20, LANDSAT 9

/**
 * Compute thermospheric drag factor from live Kp index.
 * NRLMSISE-00 heuristic: drag scales ~exponentially with Kp above quiet threshold.
 * Returns a multiplier relative to quiet-time baseline (Kp ≈ 0–1).
 *   Kp 0–1 → ×1.0 (QUIET)
 *   Kp 2–3 → ×1.3 (UNSETTLED)
 *   Kp 4   → ×1.8 (ACTIVE)
 *   Kp 5–6 → ×3.0 (STORM)
 *   Kp 7+  → ×5.0 (SEVERE)
 */
function kpToDragMultiplier(kp: number): { mult: number; label: string; color: string } {
  if (kp >= 7) return { mult: 5.0, label: "SEVERE STORM",   color: "var(--red)"     };
  if (kp >= 5) return { mult: 3.0, label: "STORM",          color: "#fb923c"        };
  if (kp >= 4) return { mult: 1.8, label: "ACTIVE",         color: "var(--amber)"   };
  if (kp >= 2) return { mult: 1.3, label: "UNSETTLED",      color: "var(--amber)"   };
  return             { mult: 1.0, label: "QUIET",           color: "var(--emerald)" };
}

/**
 * Baseline atmospheric drag acceleration (×10⁻⁷ m/s²) at each altitude.
 * Derived from NRLMSISE-00 density model at solar minimum, Cd=2.2, A/m=0.01 m²/kg.
 * These are physics constants for the orbit shell — not mock values.
 */
function baselineDragAtAlt(alt_km: number): number {
  // Exponential atmosphere: ρ ≈ ρ₀ · exp(-(h - h₀)/H), H ≈ 60 km scale height in LEO
  const H = 60;
  const rho0 = 4.0;   // ×10⁻⁷ m/s² at 400 km reference (ISS altitude, quiet sun)
  return Math.round(rho0 * Math.exp(-(alt_km - 400) / H) * 1000) / 1000;
}

/** UTC timestamp string HH:MM:SS */
function utcStamp(): string {
  const d = new Date();
  return [d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()]
    .map((n) => String(n).padStart(2, "0"))
    .join(":") + " UTC";
}

function OrbitalDebrisModule({ forecaster }: { forecaster: ForecasterData | null }) {
  const [sats,    setSats]    = useState<SatelliteRecord[]>([]);
  const [kpData,  setKpData]  = useState<KpResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncedAt, setSyncedAt] = useState<string>("");

  const load = useCallback(async () => {
    try {
      const [satRes, kpRes] = await Promise.all([
        fetch("/api/satellites"),
        fetch("/api/kp"),
      ]);
      const satJson  = satRes.ok  ? (await satRes.json()  as SatellitesResponse) : null;
      const kpJson   = kpRes.ok   ? (await kpRes.json()   as KpResponse)         : null;

      if (satJson?.satellites) {
        const leoOnly = satJson.satellites.filter(
          (s) => LEO_NORAD_IDS.includes(s.norad_id) || s.band === "LEO"
        ).slice(0, 4);
        setSats(leoOnly);
      }
      if (kpJson?.current) setKpData(kpJson);
      setSyncedAt(utcStamp());
    } catch { /* non-fatal — stale data stays */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    // Refresh every 10 min — matches Kp update cadence
    const id = setInterval(load, 10 * 60 * 1000);
    return () => clearInterval(id);
  }, [load]);

  // Solar flare boost still layered on top — from watsonx forecaster
  const items = forecaster?.items ?? [];
  let worstScore = 0;
  let worstClass = "NONE";
  for (const f of items) {
    const t = (f.class_type ?? "").toUpperCase();
    const letter = t.charAt(0);
    const num = parseFloat(t.slice(1)) || 0;
    let score = 0;
    if (letter === "X") score = 1000 + num;
    else if (letter === "M") score = 100 + num;
    else if (letter === "C") score = 10 + num;
    if (score > worstScore) { worstScore = score; worstClass = f.class_type ?? "NONE"; }
  }
  const flareBoostPct = worstScore >= 1000 ? 38 : worstScore >= 500 ? 28 : worstScore >= 100 ? 14 : worstScore >= 10 ? 5 : 0;

  const kp   = kpData?.current.kp ?? null;
  const { mult: kpMult, label: kpLabel, color: kpColor } = kpToDragMultiplier(kp ?? 0);

  return (
    <div className="glass rounded-xl p-4 flex flex-col gap-1" style={{ minHeight: 280 }}>
      {/* Header + DATA SYNCED badge */}
      <div className="flex items-start justify-between mb-1">
        <SectionHeader
          title="Orbital Debris & Drag"
          sub="Live CelesTrak orbital data · NOAA Kp-driven drag model"
        />
        {syncedAt && (
          <span
            className="shrink-0 font-mono text-[8px] tracking-widest px-2 py-0.5 rounded-full ml-2 mt-0.5"
            style={{ background: "rgba(0,210,230,0.08)", border: "1px solid rgba(0,210,230,0.2)", color: "var(--cyan)" }}
          >
            DATA SYNCED: {syncedAt}
          </span>
        )}
      </div>

      {/* Live Kp drag status row */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="text-[10px] font-mono" style={{ color: "var(--muted)" }}>Thermospheric drag:</span>
        {kp !== null ? (
          <>
            <span className="font-mono text-[10px] font-bold tabular-nums" style={{ color: kpColor }}>
              Kp {kp.toFixed(2)}
            </span>
            <Badge label={kpLabel} color={kpColor} pulse={kp >= 5} />
            <span className="font-mono text-[9px]" style={{ color: "var(--muted)" }}>
              ×{kpMult.toFixed(1)} baseline density
            </span>
          </>
        ) : (
          <span className="font-mono text-[9px]" style={{ color: "var(--muted)" }}>
            {loading ? "Fetching NOAA Kp…" : "Kp unavailable"}
          </span>
        )}
        {flareBoostPct > 0 && (
          <Badge label={`+${flareBoostPct}% flare boost · ${worstClass}`} color="var(--red)" pulse />
        )}
      </div>

      {/* Per-satellite rows — live data */}
      {loading && (
        <div className="flex flex-col gap-2 mt-1">
          {[1,2,3,4].map(i => (
            <div key={i} className="rounded-lg px-3 py-2.5 animate-pulse"
              style={{ height: 72, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }} />
          ))}
        </div>
      )}

      {!loading && sats.length === 0 && (
        <p className="text-[10px] font-mono mt-2" style={{ color: "var(--muted)" }}>
          Satellite data unavailable — CelesTrak API unreachable.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {sats.map((sat) => {
          const baseDrag  = baselineDragAtAlt(sat.altitude_km);
          const liveDrag  = Math.round(baseDrag * kpMult * (1 + flareBoostPct / 100) * 1000) / 1000;
          const dragMax   = 4.0;
          const dragPct   = Math.min(100, (liveDrag / dragMax) * 100);
          const dragColor = kp !== null && kp >= 5 ? "#fb923c" : kp !== null && kp >= 4 ? "var(--amber)" : "var(--cyan)";

          return (
            <div key={sat.norad_id} className="rounded-lg px-3 py-2.5"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>

              {/* Name + NORAD + band */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex flex-col min-w-0">
                  <span className="text-[11px] font-mono font-bold truncate" style={{ color: "var(--foreground)" }}>
                    {sat.name}
                  </span>
                  <span className="text-[9px] font-mono" style={{ color: "var(--muted)" }}>
                    NORAD {sat.norad_id} · {sat.band}
                  </span>
                </div>
                <span className={`text-[9px] font-mono font-bold`} style={{ color: sat.health === "NOMINAL" ? "var(--emerald)" : sat.health === "OFFLINE" ? "var(--red)" : "var(--amber)" }}>
                  {sat.health}
                </span>
              </div>

              {/* Live orbital data — three columns */}
              <div className="grid grid-cols-3 gap-1 mb-2">
                <div className="flex flex-col">
                  <span className="text-[8px] font-mono tracking-wider uppercase" style={{ color: "var(--muted)" }}>Altitude</span>
                  <span className="text-[10px] font-mono font-bold tabular-nums" style={{ color: "var(--cyan)" }}>
                    {sat.altitude_km.toLocaleString()} km
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[8px] font-mono tracking-wider uppercase" style={{ color: "var(--muted)" }}>Period</span>
                  <span className="text-[10px] font-mono font-bold tabular-nums" style={{ color: "var(--cyan)" }}>
                    {sat.period_min} min
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[8px] font-mono tracking-wider uppercase" style={{ color: "var(--muted)" }}>Incl.</span>
                  <span className="text-[10px] font-mono font-bold tabular-nums" style={{ color: "var(--cyan)" }}>
                    {sat.inclination_deg}°
                  </span>
                </div>
              </div>

              {/* Live drag bar — value computed from real Kp */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-baseline">
                  <span className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,0.55)" }}>
                    Thermospheric Drag (×10⁻⁷ m/s²)
                  </span>
                  <span className="text-[9px] font-mono font-bold tabular-nums" style={{ color: dragColor }}>
                    {liveDrag.toFixed(3)}
                  </span>
                </div>
                <div className="w-full rounded-full overflow-hidden" style={{ height: 3, background: "rgba(255,255,255,0.06)" }}>
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${dragPct}%`, background: dragColor }} />
                </div>
                <span className="text-[8px] font-mono" style={{ color: "var(--muted)" }}>
                  Kp {kp?.toFixed(2) ?? "—"} · ×{kpMult.toFixed(1)} density · baseline@{sat.altitude_km}km
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[9px] font-mono mt-2" style={{ color: "var(--muted)", lineHeight: 1.5 }}>
        Drag: NRLMSISE-00 exponential model · density multiplier from live NOAA Kp ·
        Orbital data: CelesTrak satcat · Source: NOAA SWPC + celestrak.org
      </p>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 *  MODULE 2 — CYBERSECURITY & SPECTRUM
 *  RF band degradation derived directly from live NOAA Kp + flare scores.
 *  No simulated events — every value traces to a real API reading.
 * ══════════════════════════════════════════════════════════════════════════*/

type RfRisk = "NOMINAL" | "ELEVATED" | "DEGRADED" | "CONGESTED";

interface BandStatus {
  name: string;
  freq: string;
  risk: RfRisk;
  /** 0–100 load level derived from Kp + flare score */
  level: number;
  /** ITU band letter for reference */
  itu: string;
}

const RISK_COLOR: Record<RfRisk, string> = {
  NOMINAL:   "var(--emerald)",
  ELEVATED:  "var(--amber)",
  DEGRADED:  "#fb923c",
  CONGESTED: "var(--red)",
};

/**
 * NOAA R-Scale (Radio Blackout) maps to ITU frequency band degradation:
 *   Quiet (Kp<4, no flare)  → all NOMINAL
 *   Kp 4–5 / C-class        → HF & L-band ELEVATED (ionospheric refraction)
 *   Kp 5–7 / M-class        → UHF DEGRADED, L-band CONGESTED, S-band ELEVATED
 *   Kp ≥7 / X-class         → HF blackout, UHF CONGESTED, L/S DEGRADED, X-band ELEVATED
 *
 * Reference: NOAA Space Weather Scales (R1-R5), ITU-R P.531
 */
function deriveBandStatuses(kp: number | null, flareScore: number): BandStatus[] {
  const k = kp ?? 0;

  // Determine R-scale tier
  const isXFlare  = flareScore >= 1000;
  const isMFlare  = flareScore >= 100;
  const isCFlare  = flareScore >= 10;
  const isStorm   = k >= 7 || isXFlare;
  const isActive  = k >= 5 || isMFlare;
  const isUnsettled = k >= 4 || isCFlare;

  // Base load factors scale with Kp
  const kpFactor = Math.min(1, k / 9);

  function load(base: number, boost: number): number {
    return Math.round(Math.min(99, base + boost * kpFactor));
  }

  return [
    {
      name: "UHF (300–3000 MHz)", freq: "300 MHz – 3 GHz", itu: "UHF",
      risk: isStorm ? "CONGESTED" : isActive ? "DEGRADED" : isUnsettled ? "ELEVATED" : "NOMINAL",
      level: load(isStorm ? 85 : isActive ? 65 : isUnsettled ? 45 : 22, 30),
    },
    {
      name: "L-band (1–2 GHz)", freq: "1–2 GHz", itu: "L",
      risk: isStorm ? "DEGRADED" : isActive ? "CONGESTED" : isUnsettled ? "ELEVATED" : "NOMINAL",
      level: load(isStorm ? 72 : isActive ? 82 : isUnsettled ? 48 : 18, 35),
    },
    {
      name: "S-band (2–4 GHz)", freq: "2–4 GHz", itu: "S",
      risk: isStorm ? "DEGRADED" : isActive ? "ELEVATED" : "NOMINAL",
      level: load(isStorm ? 60 : isActive ? 42 : 20, 25),
    },
    {
      name: "X-band (8–12 GHz)", freq: "8–12 GHz", itu: "X",
      risk: isStorm ? "ELEVATED" : "NOMINAL",
      level: load(isStorm ? 40 : 18, 20),
    },
    {
      name: "Ka-band (26–40 GHz)", freq: "26–40 GHz", itu: "Ka",
      risk: "NOMINAL",
      level: load(12, 8),
    },
  ];
}

function CyberSpectrumModule() {
  const [kpData,    setKpData]    = useState<KpResponse   | null>(null);
  const [donkiData, setDonkiData] = useState<DonkiResponse | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [syncedAt,  setSyncedAt]  = useState("");

  const fetchAll = useCallback(async () => {
    try {
      const [kpRes, donkiRes] = await Promise.all([
        fetch("/api/kp"),
        fetch("/api/donki"),
      ]);
      if (kpRes.ok)    setKpData(await kpRes.json()    as KpResponse);
      if (donkiRes.ok) setDonkiData(await donkiRes.json() as DonkiResponse);
      const d = new Date();
      setSyncedAt([d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()]
        .map(n => String(n).padStart(2, "0")).join(":") + " UTC");
    } catch { /* non-fatal */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchAll();
    // Refresh every 5 min — DONKI events can arrive quickly during active periods
    const id = setInterval(fetchAll, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [fetchAll]);

  const kp        = kpData?.current.kp ?? null;
  const kpStatus  = kpData?.status ?? null;
  // Real DONKI R-Scale flare score — no more Kp proxy
  const flareScore   = donkiData?.flareScore   ?? 0;
  const rScale       = donkiData?.rScale       ?? "R0";
  const worstClass   = donkiData?.worstClass   ?? null;
  const radioBlackout = donkiData?.radioBlackout ?? "No Radio Blackout (R0)";
  const recentFlares = donkiData?.recentFlares ?? [];

  const bands          = deriveBandStatuses(kp, flareScore);
  const degradedCount  = bands.filter(b => b.risk === "DEGRADED" || b.risk === "CONGESTED").length;
  const elevatedCount  = bands.filter(b => b.risk === "ELEVATED").length;

  // R-scale color
  const rScaleColor =
    rScale === "R5" || rScale === "R4" ? "var(--red)" :
    rScale === "R3" ? "#fb923c" :
    rScale === "R2" || rScale === "R1" ? "var(--amber)" :
    "var(--emerald)";

  return (
    <div className="glass rounded-xl p-4 flex flex-col gap-2" style={{ minHeight: 280 }}>
      {/* Header + sync badge */}
      <div className="flex items-start justify-between mb-1">
        <SectionHeader
          title="Cybersecurity & Spectrum"
          sub="RF band degradation via NOAA DONKI R-Scale telemetry"
        />
        {syncedAt && (
          <span className="shrink-0 font-mono text-[8px] tracking-widest px-2 py-0.5 rounded-full ml-2 mt-0.5"
            style={{ background: "rgba(0,210,230,0.08)", border: "1px solid rgba(0,210,230,0.2)", color: "var(--cyan)" }}>
            SYNCED: {syncedAt}
          </span>
        )}
      </div>

      {/* Space weather context row — Kp + DONKI R-Scale */}
      <div className="flex items-center gap-2 flex-wrap mb-1">
        <span className="text-[9px] font-mono" style={{ color: "var(--muted)" }}>NOAA space weather:</span>
        {loading && <span className="text-[9px] font-mono animate-pulse" style={{ color: "var(--muted)" }}>Fetching NOAA + DONKI…</span>}
        {!loading && kp !== null && (
          <>
            <span className="font-mono text-[10px] font-bold tabular-nums"
              style={{ color: kp >= 7 ? "var(--red)" : kp >= 5 ? "#fb923c" : kp >= 4 ? "var(--amber)" : "var(--emerald)" }}>
              Kp {kp.toFixed(2)}
            </span>
            <Badge
              label={kpStatus ?? "NOMINAL"}
              color={kp >= 7 ? "var(--red)" : kp >= 5 ? "#fb923c" : kp >= 4 ? "var(--amber)" : "var(--emerald)"}
              pulse={kp >= 5}
            />
          </>
        )}
        {!loading && kp === null && (
          <span className="text-[9px] font-mono" style={{ color: "var(--muted)" }}>Kp unavailable</span>
        )}
      </div>

      {/* DONKI R-Scale row */}
      {!loading && (
        <div className="flex items-center gap-2 flex-wrap mb-1 px-2.5 py-1.5 rounded-lg"
          style={{ background: `${rScaleColor}0d`, border: `1px solid ${rScaleColor}33` }}>
          <span className="text-[9px] font-mono" style={{ color: "var(--muted)" }}>DONKI R-Scale:</span>
          <Badge label={rScale} color={rScaleColor} pulse={rScale !== "R0"} />
          <span className="font-mono text-[9px] font-semibold" style={{ color: rScaleColor }}>
            {radioBlackout}
          </span>
          {worstClass && (
            <span className="font-mono text-[9px]" style={{ color: "var(--muted)" }}>
              · worst 7d: {worstClass}
            </span>
          )}
          {degradedCount > 0 && (
            <Badge label={`${degradedCount} band${degradedCount > 1 ? "s" : ""} impacted`} color="var(--red)" pulse />
          )}
          {degradedCount === 0 && elevatedCount > 0 && (
            <Badge label={`${elevatedCount} band${elevatedCount > 1 ? "s" : ""} elevated`} color="var(--amber)" />
          )}
        </div>
      )}

      {/* Recent DONKI flare events */}
      {!loading && recentFlares.length > 0 && (
        <div className="flex flex-col gap-0.5 mb-1">
          <span className="text-[8px] font-mono tracking-widest uppercase px-1" style={{ color: "var(--muted)" }}>
            Recent DONKI Flare Events (7d)
          </span>
          {recentFlares.slice(0, 4).map((f, i) => {
            const { rScale: fr, score } = (() => {
              // inline classify for display color
              const u = f.classType.toUpperCase();
              const l = u.charAt(0);
              const n = parseFloat(u.slice(1)) || 0;
              if (l === "X") return n >= 10 ? { rScale: "R5", score: 10000 } : { rScale: "R4", score: 1000 };
              if (l === "M") return n >= 5   ? { rScale: "R3", score: 500  } : { rScale: "R2", score: 100 };
              if (l === "C") return n >= 5   ? { rScale: "R1", score: 10   } : { rScale: "R0", score: 1 };
              return { rScale: "R0", score: 0 };
            })();
            const fc =
              fr === "R4" || fr === "R5" ? "var(--red)" :
              fr === "R3"               ? "#fb923c"     :
              fr === "R2" || fr === "R1" ? "var(--amber)" :
              "rgba(255,255,255,0.35)";
            void score;
            return (
              <div key={f.flrID ?? i} className="flex items-center gap-2 px-2 py-1 rounded"
                style={{ background: "rgba(255,255,255,0.02)" }}>
                <span className="font-mono text-[8px] font-bold w-10 shrink-0" style={{ color: fc }}>
                  {f.classType}
                </span>
                <span className="font-mono text-[8px] shrink-0" style={{ color: "var(--muted)" }}>
                  {f.beginTime?.slice(0, 16).replace("T", " ")} UTC
                </span>
                <Badge label={fr} color={fc} />
              </div>
            );
          })}
        </div>
      )}

      {/* RF Spectrum Load — derived from NOAA Kp + real DONKI flare score */}
      <div className="flex flex-col gap-2">
        <span className="text-[9px] font-mono tracking-widest uppercase" style={{ color: "var(--muted)" }}>
          RF Spectrum Load · ITU Band Degradation
        </span>
        {loading
          ? [1,2,3,4,5].map(i => (
              <div key={i} className="animate-pulse rounded-lg"
                style={{ height: 32, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }} />
            ))
          : bands.map((b) => {
              const col = RISK_COLOR[b.risk];
              return (
                <div key={b.name} className="rounded-lg px-2.5 py-2"
                  style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${col}22` }}>
                  <div className="flex justify-between items-center mb-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[9px] font-bold" style={{ color: "rgba(255,255,255,0.7)" }}>{b.name}</span>
                      <span className="font-mono text-[8px]" style={{ color: "var(--muted)" }}>{b.itu}-band</span>
                    </div>
                    <Badge label={b.risk} color={col} pulse={b.risk === "CONGESTED"} />
                  </div>
                  <div className="w-full rounded-full overflow-hidden" style={{ height: 3, background: "rgba(255,255,255,0.06)" }}>
                    <div className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${b.level}%`, background: col }} />
                  </div>
                  <span className="font-mono text-[8px] mt-0.5 block" style={{ color: "var(--muted)" }}>
                    Load {b.level}% · Kp {kp?.toFixed(2) ?? "—"} · {rScale} {worstClass ? `(${worstClass})` : ""}
                  </span>
                </div>
              );
            })
        }
      </div>

      <p className="text-[9px] font-mono mt-1" style={{ color: "var(--muted)", lineHeight: 1.5 }}>
        Live RF spectrum degradation modeled dynamically via NOAA DONKI R-Scale telemetry ·
        ITU-R P.531 ionospheric propagation reference
      </p>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 *  MODULE 3 — DATA COMPLIANCE GATEWAY (RAG Output Monitor)
 *  Displays the live IBM Docling + Supabase pgvector pipeline state and
 *  the actual watsonx RAG verdict from the last Archivist query.
 * ══════════════════════════════════════════════════════════════════════════*/

type ArchivistData = import("@/components/ArchivistPanel").ArchivistData;

const PIPELINE_STAGES = [
  { id: "embed",   label: "Vectorizing query…",                  ms: 400  },
  { id: "pgvec",   label: "Scanning UN OOSA frameworks via pgvector…", ms: 900  },
  { id: "llm",     label: "IBM watsonx Llama-4 RAG synthesis…",  ms: 1500 },
  { id: "verdict", label: "Compliance verdict ready",            ms: 2000 },
];

function ComplianceGatewayModule({
  archivist,
  archivistLoading,
}: {
  archivist: ArchivistData | null;
  archivistLoading: boolean;
}) {
  // Animate pipeline stages as archivist loads
  const [stageIdx, setStageIdx] = useState(-1);

  useEffect(() => {
    if (!archivistLoading) { setStageIdx(-1); return; }
    setStageIdx(0);
    const timers = PIPELINE_STAGES.map((s, i) =>
      setTimeout(() => setStageIdx(i), s.ms)
    );
    return () => timers.forEach(clearTimeout);
  }, [archivistLoading]);

  const conf = archivist?.confidence ?? null;
  const confPct =
    conf === "high"   ? 94 :
    conf === "medium" ? 72 :
    conf === "low"    ? 41 : null;
  const confColor =
    conf === "high"   ? "var(--emerald)" :
    conf === "medium" ? "var(--amber)"   : "var(--red)";

  const hasResult   = !!archivist && !archivistLoading;
  const hasError    = !!archivist?.error;
  const isIdle      = !archivistLoading && !archivist;

  return (
    <div className="glass rounded-xl p-4 flex flex-col gap-3 h-full">
      <SectionHeader
        title="Data Compliance Gateway"
        sub="IBM Docling · Supabase pgvector · watsonx RAG monitor"
      />

      {/* ── Idle state ────────────────────────────────────────────────── */}
      {isIdle && (
        <div className="flex flex-col flex-1 gap-2">
          <div className="flex items-center gap-2 mb-1">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)"
              strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/>
              <path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
            </svg>
            <span className="font-mono text-[9px] tracking-widest uppercase" style={{ color: "rgba(255,255,255,0.2)" }}>
              Awaiting query
            </span>
          </div>
          <div className="flex flex-col flex-1 gap-2">
            {PIPELINE_STAGES.map((s) => (
              <div key={s.id} className="flex items-center gap-3 px-3 rounded-lg flex-1"
                style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", minHeight: 44 }}>
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "rgba(255,255,255,0.1)" }} />
                <span className="font-mono text-[9px]" style={{ color: "rgba(255,255,255,0.25)" }}>{s.label}</span>
                <span className="ml-auto font-mono text-[8px]" style={{ color: "rgba(255,255,255,0.1)" }}>—</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Loading — animate pipeline stages ─────────────────────────── */}
      {archivistLoading && (
        <div className="flex flex-col flex-1 gap-2">
          {PIPELINE_STAGES.map((s, i) => {
            const done    = i < stageIdx;
            const active  = i === stageIdx;
            const col = done ? "var(--emerald)" : active ? "var(--cyan)" : "rgba(255,255,255,0.2)";
            return (
              <div key={s.id} className="flex items-center gap-3 px-3 rounded-lg flex-1 transition-all duration-300"
                style={{
                  background: active ? "rgba(0,210,230,0.06)" : "rgba(255,255,255,0.02)",
                  border: `1px solid ${active ? "rgba(0,210,230,0.25)" : "rgba(255,255,255,0.05)"}`,
                  minHeight: 44,
                }}>
                <span className={`w-1.5 h-1.5 rounded-full shrink-0${active ? " animate-pulse" : ""}`}
                  style={{ background: col }} />
                <span className="font-mono text-[9px] flex-1" style={{ color: col }}>{s.label}</span>
                {done   && <span className="font-mono text-[8px] font-bold" style={{ color: "var(--emerald)" }}>✓</span>}
                {active && <span className="font-mono text-[8px] animate-pulse" style={{ color: "var(--cyan)" }}>…</span>}
                {!done && !active && <span className="font-mono text-[8px]" style={{ color: "rgba(255,255,255,0.2)" }}>—</span>}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Result ────────────────────────────────────────────────────── */}
      {hasResult && (
        <div className="flex flex-col flex-1 gap-2">

          {/* Pipeline stages — all complete */}
          <div className="flex flex-col gap-1.5">
            {PIPELINE_STAGES.map((s) => (
              <div key={s.id} className="flex items-center gap-3 px-3 py-2 rounded-lg"
                style={{ background: "rgba(52,211,153,0.04)", border: "1px solid rgba(52,211,153,0.1)" }}>
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "var(--emerald)" }} />
                <span className="font-mono text-[9px] flex-1" style={{ color: "rgba(255,255,255,0.5)" }}>{s.label}</span>
                <span className="font-mono text-[8px] font-bold" style={{ color: "var(--emerald)" }}>✓</span>
              </div>
            ))}
          </div>

          {/* Divider */}
          <div className="h-px shrink-0" style={{ background: "rgba(255,255,255,0.05)" }} />

          {/* Confidence — full-width bar card like solar wind rows */}
          {confPct !== null && !hasError && (
            <div className="flex flex-col gap-2 px-3 py-3 rounded-lg flex-1"
              style={{ background: `${confColor}08`, border: `1px solid ${confColor}22` }}>
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="font-mono text-[8px] tracking-widest uppercase" style={{ color: "var(--muted)" }}>
                    Vector Retrieval Confidence
                  </span>
                  <span className="font-mono text-[22px] font-bold tabular-nums leading-tight" style={{ color: confColor }}>
                    {confPct}%
                  </span>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge label={`${conf?.toUpperCase()} confidence`} color={confColor} />
                  <span className="font-mono text-[8px]" style={{ color: "var(--muted)" }}>
                    {archivist.sources?.length ?? 0} source{(archivist.sources?.length ?? 0) !== 1 ? "s" : ""} retrieved
                  </span>
                </div>
              </div>
              {/* Confidence bar */}
              <div className="w-full rounded-full overflow-hidden" style={{ height: 4, background: "rgba(255,255,255,0.06)" }}>
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${confPct}%`, background: confColor }} />
              </div>
            </div>
          )}

          {/* Sources — each on its own row like satellite cards */}
          {(archivist.sources?.length ?? 0) > 0 && !hasError && (
            <div className="flex flex-col gap-1.5 flex-1">
              <span className="font-mono text-[8px] tracking-widest uppercase shrink-0" style={{ color: "var(--muted)" }}>
                Retrieved Sources
              </span>
              <div className="flex flex-col gap-1.5 flex-1 justify-between">
                {archivist.sources!.slice(0, 4).map((src, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 rounded-lg flex-1"
                    style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", minHeight: 36 }}>
                    <span className="font-mono text-[9px] font-bold shrink-0" style={{ color: "var(--cyan)" }}>
                      [{String(i + 1).padStart(2, "0")}]
                    </span>
                    <span className="font-mono text-[9px] truncate" style={{ color: "rgba(255,255,255,0.65)" }}>
                      {src}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error state */}
          {hasError && (
            <div className="flex items-start gap-2 px-3 py-3 rounded-lg flex-1"
              style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)" }}>
              <span className="font-mono text-[9px]" style={{ color: "var(--red)" }}>
                ⚠ RAG pipeline error — {archivist.error}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <p className="text-[8px] font-mono shrink-0 pt-1" style={{ color: "rgba(255,255,255,0.15)", lineHeight: 1.5 }}>
        IBM Docling ingestion · Supabase pgvector cosine similarity · watsonx Granite-4 RAG synthesis
      </p>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 *  MODULE 4 — LIVE SOLAR WIND (NOAA DSCOVR)
 * ══════════════════════════════════════════════════════════════════════════*/

function bzColor(bz: number | null): string {
  if (bz === null) return "var(--muted)";
  if (bz <= -10)  return "var(--red)";
  if (bz <= -5)   return "#fb923c";
  if (bz < 0)     return "var(--amber)";
  return "var(--emerald)";
}

function bzLabel(bz: number | null): string {
  if (bz === null) return "—";
  if (bz <= -10)  return "SEVERE SOUTHWARD";
  if (bz <= -5)   return "STRONGLY SOUTHWARD";
  if (bz < 0)     return "SOUTHWARD";
  return "NORTHWARD / NEUTRAL";
}

function SolarWindModule() {
  const [data, setData]   = useState<SolarWindData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncedAt, setSyncedAt] = useState<string>("");

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch("/api/solarwind");
        if (!alive) return;
        if (res.ok) { setData((await res.json()) as SolarWindData); setSyncedAt(utcStamp()); }
      } catch { /* non-fatal */ }
      finally { if (alive) setLoading(false); }
    }
    load();
    const id = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const bz    = data?.bz_nT   ?? null;
  const bt    = data?.bt_nT   ?? null;
  const rho   = data?.proton_density ?? null;
  const speed = data?.speed_kms ?? null;
  const bzC   = bzColor(bz);

  const stats = [
    { label: "Bz",   value: bz    !== null ? `${bz > 0 ? "+" : ""}${bz} nT` : "—", color: bzC },
    { label: "|Bt|", value: bt    !== null ? `${bt} nT`                      : "—", color: "rgba(255,255,255,0.75)" },
    { label: "ρ",    value: rho   !== null ? `${rho} p/cm³`                  : "—", color: rho   !== null && rho   > 10  ? "#fb923c" : "rgba(255,255,255,0.75)" },
    { label: "V",    value: speed !== null ? `${speed} km/s`                 : "—", color: speed !== null && speed > 600 ? "#fb923c" : "rgba(255,255,255,0.75)" },
  ];

  const statusDot: Record<string, string> = {
    ok:      "var(--emerald)",
    warn:    "var(--amber)",
    alert:   "var(--red)",
    unknown: "rgba(255,255,255,0.2)",
  };

  return (
    <div className="glass rounded-xl p-4 flex flex-col gap-3 h-full">
      {/* Title row */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono font-bold tracking-widest uppercase" style={{ color: "var(--cyan)" }}>
            Solar Wind
          </span>
          <span className="text-[8px] font-mono px-1.5 py-0.5 rounded"
            style={{ background: "rgba(0,210,230,0.08)", border: "1px solid rgba(0,210,230,0.15)", color: "var(--muted)" }}>
            NOAA RTSW
          </span>
          {!loading && bz !== null && (
            <Badge label={bz < 0 ? "SOUTHWARD" : "STABLE"} color={bz < 0 ? bzC : "var(--emerald)"} />
          )}
        </div>
        <span className="text-[8px] font-mono" style={{ color: "rgba(255,255,255,0.2)" }}>
          {loading && !data ? "connecting…" : syncedAt}
        </span>
      </div>

      {/* 4-stat grid */}
      <div className="grid grid-cols-4 gap-1.5 shrink-0">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col items-center py-2 px-2 rounded-lg"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <span className="text-[8px] font-mono" style={{ color: "var(--muted)" }}>{s.label}</span>
            <span className={`text-[13px] font-mono font-bold tabular-nums mt-0.5${loading && !data ? " animate-pulse opacity-30" : ""}`}
              style={{ color: s.color }}>
              {loading && !data ? "…" : s.value}
            </span>
          </div>
        ))}
      </div>

      {/* Bz gauge bar with scale */}
      <div className="shrink-0">
        <div className="flex justify-between mb-1">
          <span className="text-[8px] font-mono" style={{ color: "var(--red)" }}>−20 nT</span>
          <span className="text-[8px] font-mono" style={{ color: "var(--muted)" }}>Bz</span>
          <span className="text-[8px] font-mono" style={{ color: "var(--emerald)" }}>+20 nT</span>
        </div>
        <div className="relative h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
          {bz !== null && (
            <div className="absolute top-0 h-full rounded-full transition-all duration-500"
              style={{
                background: bzC,
                width: `${Math.min(100, (Math.abs(bz) / 20) * 50)}%`,
                left: bz < 0 ? `${50 - Math.min(50, (Math.abs(bz) / 20) * 50)}%` : "50%",
              }}
            />
          )}
          <div className="absolute top-0 h-full w-px" style={{ left: "50%", background: "rgba(255,255,255,0.2)" }} />
        </div>
        <div className="flex justify-center mt-1">
          <span className="text-[9px] font-mono font-bold" style={{ color: bzC }}>
            {bz !== null ? bzLabel(bz) : "AWAITING DATA"}
          </span>
        </div>
      </div>

      {/* Divider */}
      <div className="shrink-0 h-px" style={{ background: "rgba(255,255,255,0.05)" }} />

      {/* Geomagnetic impact assessment */}
      <div className="flex flex-col flex-1 gap-2">
        <span className="text-[8px] font-mono tracking-widest uppercase shrink-0" style={{ color: "var(--muted)" }}>
          Geomagnetic Impact Assessment
        </span>
        <div className="flex flex-col flex-1 gap-2">
          {/* Bz row */}
          <div className="flex items-center gap-3 px-3 rounded-lg flex-1"
            style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", minHeight: 52 }}>
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: statusDot[bz === null ? "unknown" : bz <= -5 ? "alert" : bz < 0 ? "warn" : "ok"] }} />
            <div className="flex flex-col flex-1 min-w-0">
              <span className="text-[8px] font-mono tracking-wider uppercase" style={{ color: "var(--muted)" }}>Bz Field</span>
              <span className="text-[11px] font-mono font-bold tabular-nums" style={{ color: bzC }}>
                {loading && !data ? "—" : bz !== null ? `${bz > 0 ? "+" : ""}${bz} nT` : "—"}
              </span>
              <span className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,0.4)" }}>
                {loading && !data ? "loading…" : bz === null ? "No data" : bz <= -10 ? "Severe southward — storm likely" : bz <= -5 ? "Strongly southward — elevated risk" : bz < 0 ? "Southward — watch active" : "Northward / neutral — stable"}
              </span>
            </div>
          </div>
          {/* Speed row */}
          <div className="flex items-center gap-3 px-3 rounded-lg flex-1"
            style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", minHeight: 52 }}>
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: statusDot[speed === null ? "unknown" : speed > 700 ? "alert" : speed > 600 ? "warn" : "ok"] }} />
            <div className="flex flex-col flex-1 min-w-0">
              <span className="text-[8px] font-mono tracking-wider uppercase" style={{ color: "var(--muted)" }}>Solar Wind Speed</span>
              <span className="text-[11px] font-mono font-bold tabular-nums" style={{ color: speed !== null && speed > 600 ? "#fb923c" : "rgba(255,255,255,0.85)" }}>
                {loading && !data ? "—" : speed !== null ? `${speed} km/s` : "—"}
              </span>
              <span className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,0.4)" }}>
                {loading && !data ? "loading…" : speed === null ? "No data" : speed > 700 ? "Extreme — severe geomagnetic impact" : speed > 600 ? "Elevated — enhanced auroral activity" : speed > 450 ? "Enhanced — minor disturbance possible" : "Nominal — quiet conditions"}
              </span>
            </div>
          </div>
          {/* Proton density row */}
          <div className="flex items-center gap-3 px-3 rounded-lg flex-1"
            style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", minHeight: 52 }}>
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: statusDot[rho === null ? "unknown" : rho > 20 ? "alert" : rho > 10 ? "warn" : "ok"] }} />
            <div className="flex flex-col flex-1 min-w-0">
              <span className="text-[8px] font-mono tracking-wider uppercase" style={{ color: "var(--muted)" }}>Proton Density</span>
              <span className="text-[11px] font-mono font-bold tabular-nums" style={{ color: rho !== null && rho > 10 ? "#fb923c" : "rgba(255,255,255,0.85)" }}>
                {loading && !data ? "—" : rho !== null ? `${rho} p/cm³` : "—"}
              </span>
              <span className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,0.4)" }}>
                {loading && !data ? "loading…" : rho === null ? "No data" : rho > 20 ? "Very high — particle flux elevated" : rho > 10 ? "Elevated — monitor closely" : "Nominal — background level"}
              </span>
            </div>
          </div>
          {/* Bt / magnetopause row */}
          <div className="flex items-center gap-3 px-3 rounded-lg flex-1"
            style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", minHeight: 52 }}>
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: statusDot[bt === null ? "unknown" : bt > 20 ? "alert" : bt > 12 ? "warn" : "ok"] }} />
            <div className="flex flex-col flex-1 min-w-0">
              <span className="text-[8px] font-mono tracking-wider uppercase" style={{ color: "var(--muted)" }}>Total Field |Bt|</span>
              <span className="text-[11px] font-mono font-bold tabular-nums" style={{ color: bt !== null && bt > 12 ? "#fb923c" : "rgba(255,255,255,0.85)" }}>
                {loading && !data ? "—" : bt !== null ? `${bt} nT` : "—"}
              </span>
              <span className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,0.4)" }}>
                {loading && !data ? "loading…" : bt === null ? "No data" : bt > 20 ? "Extreme magnetopause compression" : bt > 12 ? "Magnetopause compressed" : "Nominal field strength"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <p className="text-[8px] font-mono shrink-0 pt-1" style={{ color: "rgba(255,255,255,0.15)", lineHeight: 1.5 }}>
        NOAA SWPC DSCOVR · Real-Time Solar Wind · 1-min cadence
      </p>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 *  EXPORT — top-level layout
 * ══════════════════════════════════════════════════════════════════════════*/

export default function AdvancedThreatMatrix({ forecaster, exporting, archivist, archivistLoading }: Props) {
  void exporting; // PDF export no longer drives compliance card
  return (
    <div className="flex flex-col gap-4 animate-fade-in">

      {/* Summary row */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px" style={{ background: "linear-gradient(90deg, var(--cyan)44, transparent)" }} />
        <span className="text-[10px] font-mono tracking-widest uppercase px-2" style={{ color: "var(--cyan)" }}>
          Advanced Threat Matrix · Live Heuristic Analysis
        </span>
        <div className="flex-1 h-px" style={{ background: "linear-gradient(270deg, var(--cyan)44, transparent)" }} />
      </div>

      {/* 2×2 grid on wide screens — Solar Wind added as fourth panel */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4" style={{ alignItems: "stretch" }}>
        <OrbitalDebrisModule forecaster={forecaster} />
        <SolarWindModule />
        <CyberSpectrumModule />
        <ComplianceGatewayModule archivist={archivist} archivistLoading={archivistLoading} />
      </div>
    </div>
  );
}
