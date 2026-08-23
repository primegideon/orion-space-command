"use client";

import { useState } from "react";

export interface AsteroidItem {
  name: string;
  nasa_id?: string;        // NASA SPK-ID — used to navigate the Eyes viewer
  miss_distance_km: number | null;
  estimated_diameter_km_max: number | null;
  is_potentially_hazardous: boolean;
  relative_velocity_kmh: number | null;
  close_approach_date: string;
}

/**
 * NASA Eyes on the Solar System — embeddable interactive 3D viewer.
 * Verified: no X-Frame-Options, Access-Control-Allow-Origin: *
 * Hash route #/asteroid/<SPK-ID> flies directly to the target body.
 */
export function eyesUrl(item: AsteroidItem): string {
  if (item.nasa_id) {
    return `https://eyes.nasa.gov/apps/solar-system/#/asteroid/${item.nasa_id}`;
  }
  return "https://eyes.nasa.gov/apps/solar-system/#/home";
}

/** JPL SBDB orbit data sheet — opens in new tab (X-Frame blocked, external only) */
export function jplOrbitUrl(item: AsteroidItem): string {
  const sstr = encodeURIComponent(item.nasa_id ?? item.name);
  return `https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=${sstr}&view=VOP`;
}

export interface SentinelData {
  agent: "sentinel";
  items: AsteroidItem[];
  count: number;
  summary: string;
  date_range?: { start: string; end: string };
  error?: string;
}

interface Props {
  data: SentinelData | null;
  loading: boolean;
  active: boolean;
  dimmed?: boolean;
  onSelectItem?: (item: AsteroidItem) => void;
}

function fmt(n: number | null, decimals = 0): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/* ── Radar sweep idle animation ──────────────────────────────────────────── */
function RadarIdle() {
  const blips = [
    { x: 62, y: 38, delay: "0s",   dur: "3.2s" },
    { x: 30, y: 55, delay: "1.1s", dur: "4s"   },
    { x: 70, y: 68, delay: "2.4s", dur: "2.8s" },
  ];

  return (
    <div className="flex flex-col items-center justify-center gap-4 w-full h-full min-h-[320px] select-none">
      <div className="relative w-24 h-24">
        {[24, 40, 56, 72].map((d, i) => (
          <span key={d} className="absolute rounded-full border border-[var(--cyan)]"
            style={{ width: d, height: d, top: "50%", left: "50%",
              transform: "translate(-50%,-50%)", opacity: 0.06 + i * 0.04 }} />
        ))}
        <span className="absolute rounded-full border border-[var(--cyan)] animate-[radar-ping_2s_ease-out_infinite]"
          style={{ width: 72, height: 72, top: "50%", left: "50%", transform: "translate(-50%,-50%)", opacity: 0 }} />
        <div className="absolute inset-0 animate-[radar-sweep_4s_linear_infinite]" style={{ transformOrigin: "50% 50%" }}>
          <div style={{ position: "absolute", top: "50%", left: "50%", width: "48%", height: "2px",
            transformOrigin: "0% 50%", background: "linear-gradient(90deg, var(--cyan), transparent)",
            borderRadius: "1px", opacity: 0.85 }} />
        </div>
        {blips.map((b, i) => (
          <span key={i} className="absolute rounded-full"
            style={{ width: 3, height: 3, left: `${b.x}%`, top: `${b.y}%`,
              transform: "translate(-50%,-50%)", background: "var(--cyan)",
              boxShadow: "0 0 4px var(--cyan)",
              animation: `blip-appear ${b.dur} ${b.delay} ease-in-out infinite` }} />
        ))}
        <span className="absolute rounded-full"
          style={{ width: 6, height: 6, top: "50%", left: "50%",
            transform: "translate(-50%,-50%)", background: "var(--cyan)",
            boxShadow: "0 0 8px var(--cyan)" }} />
      </div>

      <div className="flex items-center gap-1.5">
        <p className="text-[11px] font-mono tracking-widest uppercase" style={{ color: "var(--muted)" }}>Scanning</p>
        <span className="inline-block w-[7px] h-[11px] rounded-sm"
          style={{ background: "var(--cyan)", opacity: 0.8, animation: "cursor-blink-sentinel 1.1s step-end infinite" }} />
      </div>

      <style>{`
        @keyframes blip-appear {
          0%, 100% { opacity: 0; transform: translate(-50%,-50%) scale(0.5); }
          30%, 70%  { opacity: 0.9; transform: translate(-50%,-50%) scale(1); }
        }
        @keyframes cursor-blink-sentinel {
          0%, 100% { opacity: 0.8; }
          50%       { opacity: 0; }
        }
      `}</style>
    </div>
  );
}

/* ── Main component ───────────────────────────────────────────────────────── */
export default function SentinelPanel({ data, loading, active, dimmed, onSelectItem }: Props) {
  const displayed = data?.items?.slice(0, 10) ?? [];
  const overflow  = (data?.items?.length ?? 0) - 10;

  // Default target: first PHO, otherwise closest miss
  const defaultTarget = data?.items?.length
    ? (data.items.find(a => a.is_potentially_hazardous) ??
       data.items.reduce((a, b) =>
         (a.miss_distance_km ?? Infinity) <= (b.miss_distance_km ?? Infinity) ? a : b))
    : null;

  // Clicking a table row switches the iframe to that asteroid
  const [viewTarget, setViewTarget] = useState<AsteroidItem | null>(null);
  const activeTarget = viewTarget ?? defaultTarget;

  return (
    <div className={`glass flex flex-col p-5 transition-all duration-400 h-full min-h-[450px] overflow-hidden
      ${active ? "glass-active-cyan" : ""}
      ${dimmed ? "panel-inactive" : ""}`}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between shrink-0 mb-4">
        <div>
          <span className="label">Sentinel</span>
          <h2 className="font-mono font-semibold text-[15px] leading-snug mt-0.5"
            style={{ color: "var(--cyan)" }}>
            Near-Earth Objects
          </h2>
        </div>
        <span className="label px-2 py-0.5 rounded-full"
          style={{ background: "var(--cyan-dim)", color: "var(--cyan)" }}>
          NeoWs
        </span>
      </div>

      {/* ── Scrollable body ──────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin flex flex-col gap-3">

        {/* Loading */}
        {loading && (
          <div className="flex flex-col gap-2 animate-fade-in">
            {[100, 85, 70, 90, 60].map((w, i) => (
              <div key={i} className="skeleton h-5" style={{ width: `${w}%` }} />
            ))}
          </div>
        )}

        {/* Error */}
        {!loading && data?.error && (
          <p className="text-[var(--red)] text-xs font-mono">{data.error}</p>
        )}

        {/* Idle */}
        {!loading && !data && <RadarIdle />}

        {/* ── Active data ────────────────────────────────────────────────── */}
        {!loading && data && !data.error && (
          <div className="flex flex-col gap-3 animate-fade-in">

            {/* ── NASA Eyes on the Solar System — live interactive embed ── */}
            {activeTarget && (
              <div className="relative w-full rounded-xl overflow-hidden flex-shrink-0"
                style={{ height: 280, background: "#000", border: "1px solid var(--border)" }}>

                {/* 3D interactive WebGL viewer — no X-Frame-Options on eyes.nasa.gov */}
                <iframe
                  key={eyesUrl(activeTarget)}
                  src={eyesUrl(activeTarget)}
                  title={`NASA Eyes on the Solar System · ${activeTarget.name}`}
                  allow="fullscreen"
                  style={{
                    width: "100%", height: "100%",
                    border: "none", display: "block",
                    background: "#000",
                  }}
                />

                {/* HUD overlay */}
                <div
                  className="absolute inset-x-0 bottom-0 px-3 py-2 flex items-end justify-between pointer-events-none"
                  style={{ background: "linear-gradient(transparent, rgba(0,0,0,0.80))" }}
                >
                  {/* Target label */}
                  <div className="flex flex-col">
                    <span className="font-mono text-[8px] tracking-widest uppercase"
                      style={{ color: "rgba(255,255,255,0.4)" }}>
                      NASA EYES · SOLAR SYSTEM · LIVE
                    </span>
                    <span className="font-mono text-[12px] font-bold" style={{ color: "var(--cyan)" }}>
                      {activeTarget.name}
                    </span>
                    {activeTarget.is_potentially_hazardous && (
                      <span className="font-mono text-[8px] font-bold animate-pulse" style={{ color: "var(--red)" }}>
                        ⬡ POTENTIALLY HAZARDOUS OBJECT
                      </span>
                    )}
                  </div>

                  {/* Action buttons — re-enable pointer events */}
                  <div className="flex gap-1.5 pointer-events-auto">
                    <a
                      href={eyesUrl(activeTarget)}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Open in NASA Eyes full screen"
                      className="flex items-center gap-1 px-2 py-1 rounded-lg font-mono text-[8px] font-bold tracking-widest uppercase"
                      style={{
                        background: "rgba(0,210,230,0.18)",
                        border: "1px solid rgba(0,210,230,0.4)",
                        color: "var(--cyan)",
                        textDecoration: "none",
                      }}
                    >
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                        <polyline points="15 3 21 3 21 9"/>
                        <line x1="10" y1="14" x2="21" y2="3"/>
                      </svg>
                      Full Screen
                    </a>
                    <a
                      href={jplOrbitUrl(activeTarget)}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Open orbit data in NASA JPL SBDB"
                      className="flex items-center px-2 py-1 rounded-lg font-mono text-[8px] font-bold tracking-widest uppercase"
                      style={{
                        background: "rgba(255,255,255,0.07)",
                        border: "1px solid rgba(255,255,255,0.18)",
                        color: "rgba(255,255,255,0.6)",
                        textDecoration: "none",
                      }}
                    >
                      JPL Data
                    </a>
                  </div>
                </div>
              </div>
            )}

            {/* Summary */}
            <p className="text-[13px] leading-relaxed" style={{ color: "#a0c4d8" }}>{data.summary}</p>

            {/* ── Asteroid table — click row to switch viewer ───────────── */}
            <div className="overflow-x-auto scrollbar-thin -mx-1 px-1">
              <table className="w-full text-[12px] border-collapse">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    {["Name","Date","Miss Dist.","Ø km","km/h","Hazard"].map((h) => (
                      <th key={h} className="text-left py-1.5 pr-3 font-mono font-normal whitespace-nowrap"
                        style={{ color: "var(--muted)" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayed.map((a, i) => {
                    const isViewing = activeTarget?.name === a.name;
                    return (
                      <tr
                        key={i}
                        className="transition-colors cursor-pointer"
                        style={{
                          borderBottom: "1px solid var(--border)",
                          background: isViewing ? "rgba(0,210,230,0.07)" : undefined,
                        }}
                        onClick={() => {
                          setViewTarget(a);
                          onSelectItem?.(a);
                        }}
                      >
                        <td className="py-2 pr-3 font-mono whitespace-nowrap"
                          style={{ color: isViewing ? "var(--cyan)" : "rgba(255,255,255,0.8)" }}>
                          {isViewing && <span className="mr-1 text-[8px]">▶</span>}
                          {a.name}
                        </td>
                        <td className="py-2 pr-3 font-mono whitespace-nowrap" style={{ color: "var(--muted)" }}>
                          {a.close_approach_date}
                        </td>
                        <td className="py-2 pr-3 font-mono whitespace-nowrap" style={{ color: "var(--cyan)" }}>
                          {fmt(a.miss_distance_km)}<span className="opacity-50 ml-0.5 text-[10px]">km</span>
                        </td>
                        <td className="py-2 pr-3 font-mono whitespace-nowrap text-white/70">
                          {fmt(a.estimated_diameter_km_max, 3)}
                        </td>
                        <td className="py-2 pr-3 font-mono whitespace-nowrap text-white/70">
                          {fmt(a.relative_velocity_kmh)}
                        </td>
                        <td className="py-2">
                          {a.is_potentially_hazardous ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold"
                              style={{ background: "var(--red-dim)", color: "var(--red)" }}>PHO</span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono"
                              style={{ background: "var(--emerald-dim)", color: "var(--emerald)" }}>safe</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Interaction hint */}
            <p className="text-[9px] font-mono" style={{ color: "var(--muted)" }}>
              ▶ Click any row to load that orbit · Drag to rotate · Scroll to zoom · Source: NASA JPL Eyes
            </p>

            {overflow > 0 && (
              <p className="text-[11px] font-mono" style={{ color: "var(--muted)" }}>
                +{overflow} more objects
              </p>
            )}
          </div>
        )}

      </div>{/* end scrollable body */}
    </div>
  );
}
