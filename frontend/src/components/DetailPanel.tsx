"use client";

import type { AsteroidItem } from "./SentinelPanel";
import { jplOrbitUrl } from "./SentinelPanel";
import type { FlareItem } from "./ForecasterPanel";

interface DetailPanelProps {
  item: AsteroidItem | FlareItem | null;
  type: "asteroid" | "flare" | null;
  onClose: () => void;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 py-2" style={{ borderBottom: "1px solid var(--border)" }}>
      <span className="label">{label}</span>
      <span className="font-mono text-[12px] text-white/80">{value}</span>
    </div>
  );
}

function fmt(n: number | null, decimals = 0): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatTime(t: string | null): string {
  if (!t) return "—";
  return t.replace("T", " ").replace(/:00$/, "").slice(0, 16);
}

export default function DetailPanel({ item, type, onClose }: DetailPanelProps) {
  const isOpen = item !== null;

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30"
          style={{ background: "rgba(0,0,0,0.3)" }}
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        className="fixed top-0 right-0 h-full z-40 flex flex-col"
        style={{
          width: 320,
          transform: isOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
          background: "rgba(10, 15, 25, 0.96)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          borderLeft: "1px solid var(--border)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <span
            className="text-[10px] font-mono tracking-[0.18em] uppercase"
            style={{ color: "var(--cyan)" }}
          >
            Detail Analysis
          </span>
          <button
            onClick={onClose}
            className="text-[16px] leading-none transition-opacity hover:opacity-100 opacity-50 font-mono"
            style={{ color: "var(--foreground)" }}
            aria-label="Close detail panel"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4 flex flex-col gap-0">
          {item && type === "asteroid" && (() => {
            const a = item as AsteroidItem;
            return (
              <>
                <Row label="Name" value={a.name} />
                {a.nasa_id && <Row label="NASA SPK-ID" value={a.nasa_id} />}
                <Row label="Close Approach Date" value={a.close_approach_date} />
                <Row label="Miss Distance" value={`${fmt(a.miss_distance_km)} km`} />
                <Row label="Diameter (max)" value={`${fmt(a.estimated_diameter_km_max, 3)} km`} />
                <Row label="Velocity" value={`${fmt(a.relative_velocity_kmh)} km/h`} />
                <Row label="Hazard Status" value={a.is_potentially_hazardous ? "PHO - Potentially Hazardous Object" : "Safe"} />

                {/* JPL SBDB orbit viewer */}
                <div className="pt-3 pb-1">
                  <a
                    href={jplOrbitUrl(a)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl font-mono text-[10px] font-bold tracking-widest uppercase transition-all duration-200"
                    style={{
                      background: "rgba(0,210,230,0.08)",
                      border: "1px solid rgba(0,210,230,0.3)",
                      color: "var(--cyan)",
                      textDecoration: "none",
                    }}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                    Open in NASA JPL SBDB Orbit Viewer
                  </a>
                  <p className="text-[9px] font-mono mt-1.5 text-center" style={{ color: "var(--muted)" }}>
                    Opens ssd.jpl.nasa.gov · 3D orbit visualizer
                  </p>
                </div>
              </>
            );
          })()}

          {item && type === "flare" && (() => {
            const f = item as FlareItem;
            return (
              <>
                <Row label="Flare Class" value={f.class_type ?? "Unknown"} />
                <Row label="Begin Time" value={formatTime(f.begin_time)} />
                <Row label="Peak Time" value={formatTime(f.peak_time)} />
                <Row label="End Time" value={formatTime(f.end_time)} />
                <Row label="Source Location" value={f.source_location ?? "—"} />
                <Row label="Active Region" value={f.active_region != null ? `AR ${f.active_region}` : "—"} />
              </>
            );
          })()}

          {/* Raw payload */}
          {item && (
            <div className="mt-4 flex flex-col gap-2">
              <span className="label">Raw Payload</span>
              <pre
                className="text-[10px] leading-5 rounded-lg p-3 overflow-x-auto scrollbar-thin whitespace-pre-wrap break-all"
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid var(--border)",
                  color: "#8b949e",
                  fontFamily: "var(--font-geist-mono), monospace",
                }}
              >
                {JSON.stringify(item, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
