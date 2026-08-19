"use client";

export interface FlareItem {
  flr_id: string;
  class_type: string;
  begin_time: string;
  peak_time: string;
  end_time: string;
  source_location: string | null;
  active_region: number | null;
}

export interface ForecasterData {
  agent: "forecaster";
  items: FlareItem[];
  count: number;
  summary: string;
  period?: { start: string; end: string };
  error?: string;
}

interface Props {
  data: ForecasterData | null;
  loading: boolean;
  active: boolean;
}

function classBadge(classType: string): string {
  const letter = (classType ?? "").charAt(0).toUpperCase();
  if (letter === "X") return "bg-red-600 text-white";
  if (letter === "M") return "bg-orange-500 text-white";
  if (letter === "C") return "bg-amber-400 text-black";
  return "bg-slate-600 text-slate-200";
}

function formatTime(t: string): string {
  if (!t) return "—";
  // Trim seconds if present: "2024-01-15T12:30:00" → "2024-01-15 12:30"
  return t.replace("T", " ").replace(/:00$/, "").slice(0, 16);
}

export default function ForecasterPanel({ data, loading, active }: Props) {
  const borderClass = active
    ? "border-amber-400 panel-glow-amber"
    : "border-[var(--panel-border)]";
  const opacityClass =
    !active && (data !== null || loading) ? "opacity-60" : "opacity-100";

  const displayed = data?.items?.slice(0, 8) ?? [];
  const overflow = (data?.items?.length ?? 0) - 8;

  return (
    <div
      className={`rounded-lg border bg-[var(--panel-bg)] p-4 flex flex-col gap-3 transition-all duration-300 ${borderClass} ${opacityClass}`}
    >
      {/* Header */}
      <div>
        <h2 className="text-amber-400 font-mono font-bold text-sm tracking-widest uppercase">
          ☀ FORECASTER
        </h2>
        <p className="text-[var(--muted)] text-xs mt-0.5">Solar Weather Monitor</p>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex flex-col gap-2 mt-1">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 rounded bg-slate-700 animate-pulse" />
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
          <span className="text-3xl opacity-30">☀</span>
          <p className="text-[var(--muted)] text-xs">Awaiting transmission...</p>
        </div>
      )}

      {/* Data */}
      {!loading && data && !data.error && (
        <>
          <p className="text-amber-200 text-xs leading-relaxed">{data.summary}</p>
          <div className="flex flex-col gap-2">
            {displayed.map((f, i) => (
              <div
                key={i}
                className="rounded border border-[var(--panel-border)] bg-white/5 px-3 py-2 flex gap-3 items-start"
              >
                <span
                  className={`inline-block text-xs font-mono font-bold px-2 py-0.5 rounded whitespace-nowrap mt-0.5 ${classBadge(
                    f.class_type
                  )}`}
                >
                  {f.class_type ?? "?"}
                </span>
                <div className="flex flex-col gap-0.5 text-xs">
                  <span className="font-mono text-slate-300">
                    {formatTime(f.begin_time)} → {formatTime(f.peak_time)}
                  </span>
                  {f.source_location && (
                    <span className="text-[var(--muted)]">Loc: {f.source_location}</span>
                  )}
                  {f.active_region !== null && f.active_region !== undefined && (
                    <span className="text-[var(--muted)]">AR {f.active_region}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
          {overflow > 0 && (
            <p className="text-[var(--muted)] text-xs">and {overflow} more...</p>
          )}
        </>
      )}
    </div>
  );
}
