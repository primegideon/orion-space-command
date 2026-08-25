"use client";

import { useEffect, useState } from "react";
import type { KpResponse } from "@/app/api/kp/route";

const STATUS_CONFIG = {
  NOMINAL:  { color: "var(--emerald)", bg: "rgba(52,211,153,0.08)",  border: "rgba(52,211,153,0.25)",  icon: "✓", pulse: false },
  ELEVATED: { color: "var(--amber)",   bg: "rgba(251,191,36,0.08)",  border: "rgba(251,191,36,0.25)",  icon: "◆", pulse: false },
  STORM:    { color: "#fb923c",        bg: "rgba(251,146,60,0.10)",  border: "rgba(251,146,60,0.35)",  icon: "▲", pulse: true  },
  SEVERE:   { color: "var(--red)",     bg: "rgba(248,113,113,0.10)", border: "rgba(248,113,113,0.4)",  icon: "⬡", pulse: true  },
} as const;

const LABEL = {
  NOMINAL:  "GEOMAGNETIC ENV: NOMINAL",
  ELEVATED: "ELEVATED: Moderate Geomagnetic Activity",
  STORM:    "WARNING: Geomagnetic Storm in Progress",
  SEVERE:   "CRITICAL: Severe Geomagnetic Storm — High Drag",
} as const;

export default function KpStatusBanner() {
  const [data, setData]       = useState<KpResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);

  useEffect(() => {
    let alive = true;

    async function fetchKp() {
      try {
        const res = await fetch("/api/kp");
        if (!res.ok) throw new Error("non-200");
        const json = (await res.json()) as KpResponse;
        if (alive) { setData(json); setError(false); }
      } catch {
        if (alive) setError(true);
      } finally {
        if (alive) setLoading(false);
      }
    }

    fetchKp();
    // NOAA updates every 3 h; refresh every 10 min to catch updates quickly
    const id = setInterval(fetchKp, 10 * 60 * 1000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
        <span className="animate-pulse text-[10px] font-mono tracking-widest uppercase"
          style={{ color: "var(--muted)" }}>
          FETCHING NOAA KP-INDEX…
        </span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
        <span className="text-[10px] font-mono" style={{ color: "var(--muted)" }}>
          KP-INDEX: NOAA SWPC unavailable
        </span>
      </div>
    );
  }

  const cfg  = STATUS_CONFIG[data.status];
  const label = LABEL[data.status];
  const kp   = data.current.kp.toFixed(1);
  const time = data.current.time_tag.slice(0, 16).replace("T", " ") + " UTC";

  return (
    <div
      className={`flex items-center gap-4 px-3 py-2.5 rounded-xl${cfg.pulse ? " animate-pulse" : ""}`}
      style={{
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderLeft: `3px solid ${cfg.color}`,
      }}
    >
      {/* Status label + Kp value */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="font-mono text-[10px] font-bold tracking-widest uppercase"
          style={{ color: cfg.color }}>
          {label}
        </span>
        <span className="font-mono text-[11px] font-bold tabular-nums"
          style={{ color: cfg.color }}>
          (Kp: {kp})
        </span>
      </div>

      {/* Divider */}
      <div className="w-px h-4 shrink-0" style={{ background: "rgba(255,255,255,0.08)" }} />

      {/* Meta */}
      <span className="font-mono text-[9px] shrink-0" style={{ color: "var(--muted)" }}>
        Updated: {time}
      </span>
      <span className="font-mono text-[9px] shrink-0" style={{ color: "var(--muted)" }}>
        Source: NOAA SWPC
      </span>

      {/* Sparkline */}
      <div className="flex items-center gap-1.5 ml-auto shrink-0">
        <span className="font-mono text-[9px]" style={{ color: "var(--muted)" }}>24h</span>
        <svg width={64} height={14} viewBox="0 0 64 14">
          {data.history.map((r, i) => {
            const x = (i / (data.history.length - 1)) * 60 + 1;
            const barH = Math.max(2, Math.min(14, (r.kp / 9) * 14));
            const barColor =
              r.kp >= 7 ? "var(--red)" :
              r.kp >= 5 ? "#fb923c"    :
              r.kp >= 4 ? "var(--amber)" : "var(--emerald)";
            return (
              <rect key={i} x={x - 2} y={14 - barH} width={4} height={barH} rx={1}
                fill={barColor} opacity={0.7} />
            );
          })}
        </svg>
      </div>
    </div>
  );
}
