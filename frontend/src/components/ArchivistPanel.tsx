"use client";

export interface ArchivistData {
  agent: "archivist";
  sources: string[];
  answer: string;
  confidence?: string;
  error?: string;
}

interface Props {
  data: ArchivistData | null;
  loading: boolean;
  active: boolean;
  dimmed?: boolean;
}

function confidenceStyle(c: string): React.CSSProperties {
  const l = c.toLowerCase();
  if (l === "high")   return { background: "var(--emerald-dim)", color: "var(--emerald)", border: "1px solid rgba(52,211,153,0.3)" };
  if (l === "medium") return { background: "var(--amber-dim)",   color: "var(--amber)",   border: "1px solid rgba(251,191,36,0.3)" };
  return                     { background: "var(--red-dim)",     color: "var(--red)",     border: "1px solid rgba(248,113,113,0.3)" };
}

/* ── Document-scan idle ──────────────────────────────────────────────────── */
// Simulates pages of text being read by a scanning highlight bar —
// totally distinct from the bar-chart metaphors used by Forecaster / Sentinel.
function DocScanIdle() {
  // fake "text" lines: widths give natural paragraph rhythm
  const lines = [92, 85, 78, 95, 60, 88, 72, 50];

  return (
    <div className="flex flex-col items-center justify-center gap-5 py-8 select-none w-full">
      {/* document card */}
      <div
        className="relative w-full overflow-hidden rounded-lg"
        style={{
          maxWidth: 240,
          padding: "14px 16px",
          background: "rgba(52,211,153,0.04)",
          border: "1px solid rgba(52,211,153,0.12)",
        }}
      >
        {/* indexed chunks badge */}
        <div
          className="absolute top-2 right-2 z-10 font-mono text-[9px] tracking-wide px-1.5 py-0.5 rounded"
          style={{
            background: "rgba(52,211,153,0.12)",
            border: "1px solid rgba(52,211,153,0.25)",
            color: "var(--emerald)",
          }}
        >
          939 chunks indexed
        </div>
        {/* scan-line that travels top→bottom on repeat */}
        <div
          className="absolute left-0 right-0 pointer-events-none"
          style={{
            height: 28,
            background: "linear-gradient(180deg, transparent 0%, rgba(52,211,153,0.13) 40%, rgba(52,211,153,0.13) 60%, transparent 100%)",
            animation: "doc-scan 2.4s linear infinite",
            top: 0,
          }}
        />

        {/* fake text lines */}
        <div className="flex flex-col gap-[7px]">
          {/* section header stub */}
          <div className="rounded-sm mb-1"
            style={{ width: "55%", height: 7, background: "rgba(52,211,153,0.35)" }} />
          {lines.map((w, i) => (
            <div
              key={i}
              className="rounded-sm"
              style={{
                width: `${w}%`,
                height: 5,
                background: i % 3 === 2
                  ? "rgba(52,211,153,0.12)"   // short line — paragraph break feel
                  : "rgba(255,255,255,0.10)",
              }}
            />
          ))}
          {/* second section header stub */}
          <div className="rounded-sm mt-1"
            style={{ width: "40%", height: 7, background: "rgba(52,211,153,0.25)" }} />
          {[88, 76, 65].map((w, i) => (
            <div
              key={`b${i}`}
              className="rounded-sm"
              style={{
                width: `${w}%`,
                height: 5,
                background: "rgba(255,255,255,0.10)",
              }}
            />
          ))}
        </div>

        {/* cursor blink at bottom-right of doc */}
        <div
          className="absolute bottom-3 right-4"
          style={{
            width: 6, height: 11,
            background: "var(--emerald)",
            borderRadius: 1,
            opacity: 0.9,
            animation: "cursor-blink 1.1s step-end infinite",
          }}
        />
      </div>

      <p className="text-[11px] font-mono tracking-widest uppercase" style={{ color: "var(--muted)" }}>
        Indexing knowledge base
      </p>

      {/* keyframes scoped here — safe in Next.js "use client" */}
      <style>{`
        @keyframes doc-scan {
          0%   { top: -28px; }
          100% { top: 100%; }
        }
        @keyframes cursor-blink {
          0%, 100% { opacity: 0.9; }
          50%       { opacity: 0; }
        }
      `}</style>
    </div>
  );
}

export default function ArchivistPanel({ data, loading, active, dimmed }: Props) {
  return (
    <div className={`glass flex flex-col p-5 transition-all duration-400 h-full overflow-hidden
      ${active ? "glass-active-emerald" : ""}
      ${dimmed ? "panel-inactive" : ""}`}>

      {/* Header — pinned */}
      <div className="flex items-start justify-between shrink-0 mb-4">
        <div>
          <span className="label">Archivist</span>
          <h2 className="font-mono font-semibold text-[15px] leading-snug mt-0.5"
            style={{ color: "var(--emerald)" }}>
            Research RAG
          </h2>
        </div>
        <span className="label px-2 py-0.5 rounded-full"
          style={{ background: "var(--emerald-dim)", color: "var(--emerald)" }}>
          Docling
        </span>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin flex flex-col gap-3">

      {/* Loading skeletons */}
      {loading && (
        <div className="flex flex-col gap-2 animate-fade-in">
          {[100, 92, 84, 76, 60, 40].map((w, i) => (
            <div key={i} className="skeleton h-3" style={{ width: `${w}%` }} />
          ))}
        </div>
      )}

      {/* Error */}
      {!loading && data?.error && (
        <p className="text-[var(--red)] text-xs font-mono">{data.error}</p>
      )}

      {/* Idle */}
      {!loading && !data && <DocScanIdle />}

      {/* Active data */}
      {!loading && data && !data.error && (
        <div className="flex flex-col gap-4 animate-fade-in">

          {/* Answer block */}
          <div className="rounded-xl p-4"
            style={{ background: "rgba(52,211,153,0.05)", border: "1px solid rgba(52,211,153,0.12)" }}>
            <p className="text-[13px] leading-[1.75] text-white/80 whitespace-pre-wrap">{data.answer}</p>
          </div>

          {/* Confidence badge */}
          {data.confidence && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono" style={{ color: "var(--muted)" }}>Confidence</span>
              <span
                className="inline-block text-[11px] font-mono font-semibold px-2 py-0.5 rounded-md"
                style={confidenceStyle(data.confidence)}
              >
                {data.confidence}
              </span>
            </div>
          )}

          {/* Sources */}
          {data.sources && data.sources.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="label">Sources consulted</span>
              <div className="flex flex-wrap gap-1.5">
                {data.sources.map((s, i) => (
                  <span
                    key={i}
                    className="inline-block text-[11px] font-mono px-2.5 py-1 rounded-lg"
                    style={{
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid var(--border)",
                      color: "var(--muted)",
                    }}
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      </div>{/* end scrollable body */}
    </div>
  );
}
