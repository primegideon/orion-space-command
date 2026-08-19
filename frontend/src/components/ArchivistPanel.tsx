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
}

function confidenceBadge(c: string): string {
  const l = c.toLowerCase();
  if (l === "high") return "bg-green-700 text-green-200";
  if (l === "medium") return "bg-amber-700 text-amber-200";
  return "bg-red-800 text-red-200";
}

export default function ArchivistPanel({ data, loading, active }: Props) {
  const borderClass = active
    ? "border-green-400 panel-glow-green"
    : "border-[var(--panel-border)]";
  const opacityClass =
    !active && (data !== null || loading) ? "opacity-60" : "opacity-100";

  return (
    <div
      className={`rounded-lg border bg-[var(--panel-bg)] p-4 flex flex-col gap-3 transition-all duration-300 ${borderClass} ${opacityClass}`}
    >
      {/* Header */}
      <div>
        <h2 className="text-green-400 font-mono font-bold text-sm tracking-widest uppercase">
          📚 ARCHIVIST
        </h2>
        <p className="text-[var(--muted)] text-xs mt-0.5">Astrophysics Research RAG</p>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex flex-col gap-2 mt-1">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`h-3 rounded bg-slate-700 animate-pulse`}
              style={{ width: `${90 - i * 10}%` }}
            />
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
          <span className="text-3xl opacity-30">📚</span>
          <p className="text-[var(--muted)] text-xs">Awaiting transmission...</p>
        </div>
      )}

      {/* Data */}
      {!loading && data && !data.error && (
        <>
          {/* Answer */}
          <div className="border-l-2 border-green-500 pl-3">
            <p className="text-green-100 text-xs leading-relaxed whitespace-pre-wrap">
              {data.answer}
            </p>
          </div>

          {/* Confidence */}
          {data.confidence && (
            <div>
              <span
                className={`inline-block text-xs font-mono px-2 py-0.5 rounded ${confidenceBadge(
                  data.confidence
                )}`}
              >
                Confidence: {data.confidence}
              </span>
            </div>
          )}

          {/* Sources */}
          {data.sources && data.sources.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <p className="text-[var(--muted)] text-xs font-semibold">Sources consulted:</p>
              <div className="flex flex-wrap gap-1.5">
                {data.sources.map((s, i) => (
                  <span
                    key={i}
                    className="inline-block bg-slate-700 text-slate-300 text-xs font-mono px-2 py-0.5 rounded"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
