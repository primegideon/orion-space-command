"use client";

import { useState } from "react";

export type ViewId = "telemetry" | "analytics" | "fleet" | "log" | "ground" | "orbit";

interface Props {
  view: ViewId;
  onView: (v: ViewId) => void;
  onExportPdf: () => void;
  onSystemStatus: () => void;
  exporting: boolean;
}

const NAV_ITEMS: { id: ViewId; label: string; icon: React.ReactNode }[] = [
  {
    id: "telemetry",
    label: "Telemetry Core",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4.93 4.93a10 10 0 0 0 0 14.14" />
        <path d="M7.76 7.76a6 6 0 0 0 0 8.49" />
        <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
        <path d="M16.24 7.76a6 6 0 0 1 0 8.49" />
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
      </svg>
    ),
  },
  {
    id: "analytics",
    label: "Threat & Risk",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
      </svg>
    ),
  },
  {
    id: "fleet",
    label: "Constellation",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2a10 10 0 0 1 0 20" strokeDasharray="3 2" />
        <path d="M12 2a10 10 0 0 0 0 20" />
        <path d="M2 12h20" strokeDasharray="3 2" />
      </svg>
    ),
  },
  {
    id: "log",
    label: "Mission Log",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <line x1="10" y1="9"  x2="8" y2="9"  />
      </svg>
    ),
  },
  {
    id: "ground",
    label: "Ground Relay",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 17l4-8 4 8" />
        <path d="M6.5 13h3" />
        <path d="M16 17V7" />
        <path d="M13 10c1-1 2.5-1.5 3-1.5S19 9 20 10" />
        <path d="M12 7c1.5-2 4-3 4-3s2.5 1 4 3" />
        <line x1="3" y1="20" x2="21" y2="20" />
      </svg>
    ),
  },
  {
    id: "orbit",
    label: "Orbit Viewer",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="12" cy="12" rx="10" ry="4" />
        <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(60 12 12)" />
        <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(120 12 12)" />
        <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
];

export default function Sidebar({ view, onView, onExportPdf, onSystemStatus, exporting }: Props) {
  const [expanded, setExpanded] = useState(true);

  return (
    <nav
      className="flex flex-col shrink-0 py-3 gap-0.5"
      style={{
        width: expanded ? 168 : 52,
        minWidth: expanded ? 168 : 52,
        background: "rgba(4,9,15,0.88)",
        borderRight: "1px solid var(--border)",
        backdropFilter: "blur(12px)",
        transition: "width 220ms cubic-bezier(0.4,0,0.2,1), min-width 220ms cubic-bezier(0.4,0,0.2,1)",
        overflow: "hidden",
      }}
    >
      {/* ── Collapse / expand toggle ──────────────────────────────────── */}
      <button
        onClick={() => setExpanded((e) => !e)}
        aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
        className="flex items-center rounded-lg mx-1.5 mb-1 shrink-0 transition-all duration-150"
        style={{
          gap: 8,
          padding: "5px 8px",
          color: "var(--muted)",
          border: "1px solid transparent",
          justifyContent: expanded ? "flex-end" : "center",
          background: "transparent",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)";
          (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.08)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background = "transparent";
          (e.currentTarget as HTMLElement).style.borderColor = "transparent";
        }}
      >
        <svg
          width="13" height="13" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{
            flexShrink: 0,
            transition: "transform 220ms cubic-bezier(0.4,0,0.2,1)",
            transform: expanded ? "rotate(0deg)" : "rotate(180deg)",
          }}
        >
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>

      <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "0 8px 6px" }} />

      {/* ── Section label ─────────────────────────────────────────────── */}
      <span
        className="font-mono text-[8px] tracking-[0.2em] uppercase px-3 mb-1 overflow-hidden whitespace-nowrap"
        style={{
          color: "var(--muted)",
          opacity: expanded ? 0.6 : 0,
          maxHeight: expanded ? 20 : 0,
          transition: "opacity 180ms ease, max-height 220ms ease",
        }}
      >
        Navigation
      </span>

      {/* ── Nav items ─────────────────────────────────────────────────── */}
      {NAV_ITEMS.map(({ id, label, icon }) => {
        const active = view === id;
        return (
          <button
            key={id}
            onClick={() => onView(id)}
            aria-label={label}
            aria-pressed={active}
            title={expanded ? undefined : label}
            className="flex items-center rounded-lg mx-1.5 shrink-0 transition-all duration-150"
            style={{
              gap: 10,
              padding: expanded ? "7px 10px" : "9px",
              justifyContent: expanded ? "flex-start" : "center",
              background: active ? "rgba(0,210,230,0.12)" : "transparent",
              border: active ? "1px solid rgba(0,210,230,0.28)" : "1px solid transparent",
              color: active ? "var(--cyan)" : "var(--muted)",
            }}
            onMouseEnter={(e) => {
              if (!active) {
                (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)";
                (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.8)";
              }
            }}
            onMouseLeave={(e) => {
              if (!active) {
                (e.currentTarget as HTMLElement).style.background = "transparent";
                (e.currentTarget as HTMLElement).style.color = "var(--muted)";
              }
            }}
          >
            <span className="shrink-0">{icon}</span>
            <span
              className="text-[10px] font-mono font-medium tracking-wide whitespace-nowrap overflow-hidden"
              style={{
                opacity: expanded ? 1 : 0,
                maxWidth: expanded ? 140 : 0,
                transition: "opacity 160ms ease, max-width 220ms cubic-bezier(0.4,0,0.2,1)",
              }}
            >
              {label}
            </span>
          </button>
        );
      })}

      {/* ── Spacer ────────────────────────────────────────────────────── */}
      <div className="flex-1" />

      <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "6px 8px" }} />

      {/* ── Section label ─────────────────────────────────────────────── */}
      <span
        className="font-mono text-[8px] tracking-[0.2em] uppercase px-3 mb-1 overflow-hidden whitespace-nowrap"
        style={{
          color: "var(--muted)",
          opacity: expanded ? 0.6 : 0,
          maxHeight: expanded ? 20 : 0,
          transition: "opacity 180ms ease, max-height 220ms ease",
        }}
      >
        Utilities
      </span>

      {/* System Status */}
      <button
        onClick={onSystemStatus}
        aria-label="System Status"
        title={expanded ? undefined : "System Status"}
        className="flex items-center rounded-lg mx-1.5 shrink-0 transition-all duration-150"
        style={{
          gap: 10,
          padding: expanded ? "7px 10px" : "9px",
          justifyContent: expanded ? "flex-start" : "center",
          background: "rgba(52,211,153,0.07)",
          border: "1px solid rgba(52,211,153,0.18)",
          color: "var(--emerald)",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.background = "rgba(52,211,153,0.12)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background = "rgba(52,211,153,0.07)";
        }}
      >
        <span className="shrink-0">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <path d="M8 21h8" />
            <path d="M12 17v4" />
            <path d="M7 8h.01M12 8h.01M17 8h.01" />
          </svg>
        </span>
        <span
          className="text-[10px] font-mono font-medium tracking-wide whitespace-nowrap overflow-hidden"
          style={{
            opacity: expanded ? 1 : 0,
            maxWidth: expanded ? 140 : 0,
            transition: "opacity 160ms ease, max-width 220ms cubic-bezier(0.4,0,0.2,1)",
          }}
        >
          System Status
        </span>
      </button>

      {/* Export PDF */}
      <button
        onClick={onExportPdf}
        disabled={exporting}
        aria-label="Export PDF Briefing"
        title={expanded ? undefined : "Export PDF"}
        className="flex items-center rounded-lg mx-1.5 shrink-0 transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed"
        style={{
          gap: 10,
          padding: expanded ? "7px 10px" : "9px",
          justifyContent: expanded ? "flex-start" : "center",
          background: "rgba(251,191,36,0.08)",
          border: "1px solid rgba(251,191,36,0.22)",
          color: "var(--amber)",
        }}
        onMouseEnter={(e) => {
          if (!exporting) (e.currentTarget as HTMLElement).style.background = "rgba(251,191,36,0.14)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background = "rgba(251,191,36,0.08)";
        }}
      >
        <span className="shrink-0">
          {exporting ? (
            <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-80" fill="currentColor" d="M12 2a10 10 0 0 1 10 10h-3a7 7 0 0 0-7-7V2z" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v12m0 0-4-4m4 4 4-4" />
              <path d="M3 17v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2" />
            </svg>
          )}
        </span>
        <span
          className="text-[10px] font-mono font-medium tracking-wide whitespace-nowrap overflow-hidden"
          style={{
            opacity: expanded ? 1 : 0,
            maxWidth: expanded ? 140 : 0,
            transition: "opacity 160ms ease, max-width 220ms cubic-bezier(0.4,0,0.2,1)",
          }}
        >
          {exporting ? "Exporting…" : "Export PDF"}
        </span>
      </button>
    </nav>
  );
}
