"use client";

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
}

function fmt(n: number | null, decimals = 0): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export default function SentinelPanel({ data, loading, active }: Props) {
  const borderClass = active
    ? "border-cyan-400 panel-glow-cyan"
    : "border-[var(--panel-border)]";
  const opacityClass = !active && data === null && !loading ? "opacity-100" : !active && (data !== null || loading) ? "opacity-60" : "opacity-100";

  const displayed = data?.items?.slice(0, 10) ?? [];
  const overflow = (data?.items?.length ?? 0) - 10;

  return (
    <div
      className={`rounded-lg border bg-[var(--panel-bg)] p-4 flex flex-col gap-3 transition-all duration-300 ${borderClass} ${opacityClass}`}
    >
      {/* Header */}
      <div>
        <h2 className="text-cyan-400 font-mono font-bold text-sm tracking-widest uppercase">
          🛰 SENTINEL
        </h2>
        <p className="text-[var(--muted)] text-xs mt-0.5">Near-Earth Asteroid Tracker</p>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex flex-col gap-2 mt-1">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-6 rounded bg-slate-700 animate-pulse" />
          ))}
        </div>
      )}

      {/* Error */}
      {!loading && data?.error && (
        <p className="text-red-400 text-xs">{data.error}</p>
      )}

      {/* Empty state */}
      {!loading && !data && (
        <div className="flex flex-col items-center justify-center py-8 gap-2">
          <span className="text-3xl opacity-30">🛰</span>
          <p className="text-[var(--muted)] text-xs">Awaiting transmission...</p>
        </div>
      )}

      {/* Data */}
      {!loading && data && !data.error && (
        <>
          <p className="text-cyan-200 text-xs leading-relaxed">{data.summary}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="text-[var(--muted)] border-b border-[var(--panel-border)]">
                  {["NAME", "DATE", "MISS DIST.", "DIAMETER", "VELOCITY", "HAZARD"].map(
                    (h) => (
                      <th key={h} className="text-left py-1 pr-3 font-normal whitespace-nowrap">
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {displayed.map((a, i) => (
                  <tr
                    key={i}
                    className="border-b border-[var(--panel-border)] hover:bg-white/5"
                  >
                    <td className="py-1.5 pr-3 font-mono text-slate-200 whitespace-nowrap">{a.name}</td>
                    <td className="py-1.5 pr-3 font-mono whitespace-nowrap">{a.close_approach_date}</td>
                    <td className="py-1.5 pr-3 font-mono whitespace-nowrap">
                      {fmt(a.miss_distance_km)} km
                    </td>
                    <td className="py-1.5 pr-3 font-mono whitespace-nowrap">
                      {fmt(a.estimated_diameter_km_max, 3)} km
                    </td>
                    <td className="py-1.5 pr-3 font-mono whitespace-nowrap">
                      {fmt(a.relative_velocity_kmh)} km/h
                    </td>
                    <td className="py-1.5">
                      {a.is_potentially_hazardous ? (
                        <span className="text-red-400 font-bold">⚠</span>
                      ) : (
                        <span className="text-green-400">✓</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {overflow > 0 && (
            <p className="text-[var(--muted)] text-xs">and {overflow} more...</p>
          )}
        </>
      )}
    </div>
  );
}
