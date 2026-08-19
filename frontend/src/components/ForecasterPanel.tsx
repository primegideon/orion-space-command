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
  dimmed?: boolean;
  onSelectItem?: (item: FlareItem) => void;
}

function classBadgeStyle(classType: string): React.CSSProperties {
  const letter = (classType ?? "").charAt(0).toUpperCase();
  if (letter === "X") return { background: "rgba(248,113,113,0.2)",  color: "#f87171", border: "1px solid rgba(248,113,113,0.35)" };
  if (letter === "M") return { background: "rgba(251,146,60,0.2)",   color: "#fb923c", border: "1px solid rgba(251,146,60,0.35)" };
  if (letter === "C") return { background: "rgba(251,191,36,0.18)",  color: "#fbbf24", border: "1px solid rgba(251,191,36,0.35)" };
  return { background: "rgba(148,163,184,0.12)", color: "#94a3b8", border: "1px solid rgba(148,163,184,0.2)" };
}

function formatTime(t: string): string {
  if (!t) return "—";
  return t.replace("T", " ").replace(/:00$/, "").slice(0, 16);
}

/* ── Pulsing waveform idle ───────────────────────────────────────────────── */
function WaveIdle() {
  const heights = [30, 45, 60, 75, 90, 75, 55, 40, 60, 80, 65, 50, 70, 85, 60, 45, 35, 50];
  const tickerText = "MONITORING SOLAR ACTIVITY · MONITORING SOLAR ACTIVITY · ";

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-10 select-none overflow-hidden w-full">
      {/* waveform */}
      <div className="flex items-end gap-[3px]" style={{ height: 52 }}>
        {heights.map((h, i) => (
          <div
            key={i}
            className="w-[3px] rounded-full animate-[wave-pulse_1.4s_ease-in-out_infinite]"
            style={{
              height: h * 0.52,
              background: "var(--amber)",
              opacity: 0.6,
              animationDelay: `${i * 0.075}s`,
              transformOrigin: "bottom",
            }}
          />
        ))}
      </div>

      {/* scrolling ticker */}
      <div className="w-full overflow-hidden" style={{ maxWidth: 280 }}>
        <div
          className="whitespace-nowrap text-[10px] font-mono tracking-[0.15em] uppercase"
          style={{
            color: "var(--muted)",
            display: "inline-block",
            animation: "ticker-scroll 12s linear infinite",
          }}
        >
          {tickerText}{tickerText}
        </div>
      </div>
    </div>
  );
}

export default function ForecasterPanel({ data, loading, active, dimmed, onSelectItem }: Props) {
  const displayed = data?.items?.slice(0, 8) ?? [];
  const overflow  = (data?.items?.length ?? 0) - 8;

  return (
    <div className={`glass flex flex-col gap-4 p-5 transition-all duration-400
      ${active ? "glass-active-amber" : ""}
      ${dimmed ? "panel-inactive" : ""}`}>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <span className="label">Forecaster</span>
          <h2 className="font-mono font-semibold text-[15px] leading-snug mt-0.5"
            style={{ color: "var(--amber)" }}>
            Solar Weather
          </h2>
        </div>
        <span className="label px-2 py-0.5 rounded-full"
          style={{ background: "var(--amber-dim)", color: "var(--amber)" }}>
          DONKI
        </span>
      </div>

      {/* Loading skeletons */}
      {loading && (
        <div className="flex flex-col gap-2 animate-fade-in">
          {[100, 75, 90, 65, 80].map((w, i) => (
            <div key={i} className="skeleton h-12 rounded-xl" style={{ width: `${w}%` }} />
          ))}
        </div>
      )}

      {/* Error */}
      {!loading && data?.error && (
        <p className="text-[var(--red)] text-xs font-mono">{data.error}</p>
      )}

      {/* Idle */}
      {!loading && !data && <WaveIdle />}

      {/* Active data */}
      {!loading && data && !data.error && (
        <div className="flex flex-col gap-3 animate-fade-in">
          <p className="text-[13px] leading-relaxed" style={{ color: "#d4b896" }}>{data.summary}</p>

          <div className="flex flex-col gap-2">
            {displayed.map((f, i) => (
              <div
                key={i}
                className="flex gap-3 items-start rounded-xl px-3 py-2.5 transition-colors hover:bg-white/[0.06] cursor-pointer"
                style={{ background: "rgba(255,255,255,0.035)", border: "1px solid var(--border)" }}
                onClick={() => onSelectItem?.(f)}
              >
                {/* class badge */}
                <span
                  className="shrink-0 inline-block text-[11px] font-mono font-bold px-2 py-0.5 rounded-md whitespace-nowrap mt-0.5"
                  style={classBadgeStyle(f.class_type)}
                >
                  {f.class_type ?? "?"}
                </span>

                <div className="flex flex-col gap-0.5 text-[12px] min-w-0">
                  <span className="font-mono text-white/75">
                    {formatTime(f.begin_time)}
                    <span className="mx-1 opacity-40">→</span>
                    {formatTime(f.peak_time)}
                  </span>
                  <div className="flex gap-3 flex-wrap">
                    {f.source_location && (
                      <span className="font-mono text-[11px]" style={{ color: "var(--muted)" }}>
                        {f.source_location}
                      </span>
                    )}
                    {f.active_region != null && (
                      <span className="font-mono text-[11px]" style={{ color: "var(--muted)" }}>
                        AR {f.active_region}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {overflow > 0 && (
            <p className="text-[11px] font-mono" style={{ color: "var(--muted)" }}>
              +{overflow} more events
            </p>
          )}
        </div>
      )}
    </div>
  );
}
