"use client";

export interface AsteroidItem {
  name: string;
  nasa_id?: string;        // NASA SPK-ID
  miss_distance_km: number | null;
  estimated_diameter_km_max: number | null;
  is_potentially_hazardous: boolean;
  relative_velocity_kmh: number | null;
  close_approach_date: string;
}

/**
 * NASA Eyes on the Solar System — used by the dedicated Orbit Viewer tab.
 * Exported so page.tsx can still open the full-screen viewer.
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

/* ── Idle state ───────────────────────────────────────────────────────────── */
function SentinelIdle() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 w-full h-full min-h-[320px] select-none">
      <span className="font-mono text-[10px] tracking-widest uppercase animate-pulse"
        style={{ color: "var(--muted)" }}>
        Awaiting Query
      </span>
    </div>
  );
}

/* ── Main component ───────────────────────────────────────────────────────── */
export default function SentinelPanel({ data, loading, active, dimmed, onSelectItem }: Props) {
  const displayed = data?.items?.slice(0, 10) ?? [];
  const overflow  = (data?.items?.length ?? 0) - 10;

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
        {!loading && !data && <SentinelIdle />}

        {/* ── Active data ─────────────────────────────────────────────── */}
        {!loading && data && !data.error && (
          <div className="flex flex-col gap-3 animate-fade-in">

            {/* Summary */}
            <p className="text-[13px] leading-relaxed" style={{ color: "#a0c4d8" }}>{data.summary}</p>

            {/* ── Asteroid table ───────────────────────────────────────── */}
            <div className="overflow-x-auto scrollbar-thin -mx-1 px-1">
              <table className="w-full text-[12px] border-collapse">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    {["Name","Date","Miss Dist.","Ø km","km/h","Hazard",""].map((h) => (
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
                      className="transition-colors cursor-pointer hover:bg-white/5"
                      style={{ borderBottom: "1px solid var(--border)" }}
                      onClick={() => onSelectItem?.(a)}
                    >
                      <td className="py-2 pr-3 font-mono whitespace-nowrap"
                        style={{ color: "rgba(255,255,255,0.8)" }}>
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
                      <td className="py-2 pr-3">
                        {a.is_potentially_hazardous ? (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold"
                            style={{ background: "var(--red-dim)", color: "var(--red)" }}>PHO</span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono"
                            style={{ background: "var(--emerald-dim)", color: "var(--emerald)" }}>safe</span>
                        )}
                      </td>
                      <td className="py-2">
                        <a
                          href={jplOrbitUrl(a)}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open orbit data in NASA JPL SBDB"
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center px-2 py-0.5 rounded font-mono text-[8px] font-bold tracking-widest uppercase whitespace-nowrap"
                          style={{
                            background: "rgba(255,255,255,0.06)",
                            border: "1px solid rgba(255,255,255,0.15)",
                            color: "rgba(255,255,255,0.55)",
                            textDecoration: "none",
                          }}
                        >
                          JPL DATA
                        </a>
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
