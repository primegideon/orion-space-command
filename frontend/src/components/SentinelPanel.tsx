"use client";

import dynamic from "next/dynamic";

const OrbitalCanvas = dynamic(() => import("./OrbitalCanvas"), {
  ssr: false,
  loading: () => (
    <div className="w-full rounded-xl animate-pulse"
      style={{ height: 220, minHeight: 220, background: "rgba(4,9,15,0.7)", border: "1px solid var(--border)" }} />
  ),
});

export interface AsteroidItem {
  name: string;
  miss_distance_km: number | null;
  estimated_diameter_km_max: number | null;
  is_potentially_hazardous: boolean;
  relative_velocity_kmh: number | null;
  close_approach_date: string;
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
  // random blip positions (deterministic so no hydration mismatch)
  const blips = [
    { x: 62, y: 38, delay: "0s",    dur: "3.2s" },
    { x: 30, y: 55, delay: "1.1s",  dur: "4s" },
    { x: 70, y: 68, delay: "2.4s",  dur: "2.8s" },
  ];

  return (
    <div className="flex flex-col items-center justify-center gap-4 w-full h-full min-h-[320px] select-none">
      {/* radar dish */}
      <div className="relative w-24 h-24">
        {/* rings */}
        {[24, 40, 56, 72].map((d, i) => (
          <span
            key={d}
            className="absolute rounded-full border border-[var(--cyan)]"
            style={{
              width: d, height: d,
              top: "50%", left: "50%",
              transform: "translate(-50%,-50%)",
              opacity: 0.06 + i * 0.04,
            }}
          />
        ))}
        {/* ping ripple */}
        <span
          className="absolute rounded-full border border-[var(--cyan)] animate-[radar-ping_2s_ease-out_infinite]"
          style={{ width: 72, height: 72, top: "50%", left: "50%", transform: "translate(-50%,-50%)", opacity: 0 }}
        />
        {/* sweep wedge */}
        <div
          className="absolute inset-0 animate-[radar-sweep_4s_linear_infinite]"
          style={{ transformOrigin: "50% 50%" }}
        >
          <div
            style={{
              position: "absolute",
              top: "50%", left: "50%",
              width: "48%", height: "2px",
              transformOrigin: "0% 50%",
              background: "linear-gradient(90deg, var(--cyan), transparent)",
              borderRadius: "1px",
              opacity: 0.85,
            }}
          />
        </div>
        {/* random blips */}
        {blips.map((b, i) => (
          <span
            key={i}
            className="absolute rounded-full"
            style={{
              width: 3, height: 3,
              left: `${b.x}%`, top: `${b.y}%`,
              transform: "translate(-50%,-50%)",
              background: "var(--cyan)",
              boxShadow: "0 0 4px var(--cyan)",
              animation: `blip-appear ${b.dur} ${b.delay} ease-in-out infinite`,
            }}
          />
        ))}
        {/* center dot */}
        <span
          className="absolute rounded-full"
          style={{
            width: 6, height: 6,
            top: "50%", left: "50%",
            transform: "translate(-50%,-50%)",
            background: "var(--cyan)",
            boxShadow: "0 0 8px var(--cyan)",
          }}
        />
      </div>

      {/* SCANNING label with step-animation cursor */}
      <div className="flex items-center gap-1.5">
        <p className="text-[11px] font-mono tracking-widest uppercase" style={{ color: "var(--muted)" }}>
          Scanning
        </p>
        <span
          className="inline-block w-[7px] h-[11px] rounded-sm"
          style={{
            background: "var(--cyan)",
            opacity: 0.8,
            animation: "cursor-blink-sentinel 1.1s step-end infinite",
          }}
        />
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

export default function SentinelPanel({ data, loading, active, dimmed, onSelectItem }: Props) {
  const displayed = data?.items?.slice(0, 10) ?? [];
  const overflow  = (data?.items?.length ?? 0) - 10;

  return (
    <div className={`glass flex flex-col p-5 transition-all duration-400 h-full min-h-[450px] overflow-hidden
      ${active ? "glass-active-cyan" : ""}
      ${dimmed ? "panel-inactive" : ""}`}>

      {/* Header — pinned, never scrolls */}
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

      {/* Scrollable body */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin flex flex-col gap-3">

      {/* Loading skeletons */}
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

      {/* Active data */}
      {!loading && data && !data.error && (
        <div className="flex flex-col gap-3 animate-fade-in">
          {/* 3D Orbital Canvas */}
          {data.items.length > 0 && <OrbitalCanvas items={data.items} />}

          <p className="text-[13px] leading-relaxed" style={{ color: "#a0c4d8" }}>{data.summary}</p>

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
                {displayed.map((a, i) => (
                  <tr
                    key={i}
                    className="transition-colors hover:bg-white/[0.05] cursor-pointer"
                    style={{ borderBottom: "1px solid var(--border)" }}
                    onClick={() => onSelectItem?.(a)}
                  >
                    <td className="py-2 pr-3 font-mono text-white/80 whitespace-nowrap">{a.name}</td>
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
                ))}
              </tbody>
            </table>
          </div>

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
