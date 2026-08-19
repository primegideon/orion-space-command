"use client";

import { useEffect, useRef } from "react";

export interface TelemetryLog {
  ts: string;
  level: "INFO" | "ROUTE" | "FETCH" | "LLM" | "OK" | "WARN";
  msg: string;
}

interface Props {
  logs: TelemetryLog[];
  isOpen: boolean;
  onToggle: () => void;
}

const LEVEL_COLORS: Record<TelemetryLog["level"], string> = {
  INFO:  "#4a5568",
  ROUTE: "#38bdf8",
  FETCH: "#fbbf24",
  LLM:   "#a78bfa",
  OK:    "#34d399",
  WARN:  "#f87171",
};

export default function TelemetryConsole({ logs, isOpen, onToggle }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs.length, isOpen]);

  const latest = logs[logs.length - 1];

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 font-mono"
      style={{
        borderTop: "1px solid var(--border)",
        background: "rgba(8, 12, 20, 0.95)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        transition: "height 0.25s cubic-bezier(0.4,0,0.2,1)",
        height: isOpen ? 180 : 36,
        overflow: "hidden",
      }}
    >
      {/* ── Collapsed / header bar ── */}
      <div
        className="flex items-center justify-between px-4 cursor-pointer select-none shrink-0"
        style={{ height: 36, borderBottom: isOpen ? "1px solid var(--border)" : "none" }}
        onClick={onToggle}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="text-[10px] tracking-[0.18em] uppercase shrink-0"
            style={{ color: "var(--cyan)" }}
          >
            {isOpen ? "[-]" : "[+]"} TELEMETRY CONSOLE
          </span>
          {!isOpen && latest && (
            <span
              className="text-[11px] truncate opacity-60"
              style={{ color: latest ? LEVEL_COLORS[latest.level] : "var(--muted)" }}
            >
              [{latest.ts}] [{latest.level}] {latest.msg}
            </span>
          )}
        </div>
        <span className="text-[10px] shrink-0 ml-3" style={{ color: "var(--muted)" }}>
          {logs.length} events
        </span>
      </div>

      {/* ── Expanded log area ── */}
      {isOpen && (
        <div
          className="overflow-y-auto scrollbar-thin px-4 py-2 flex flex-col gap-0.5"
          style={{ height: 144 }}
        >
          {logs.length === 0 && (
            <span className="text-[11px]" style={{ color: "var(--muted)" }}>
              Awaiting events...
            </span>
          )}
          {logs.map((log, i) => (
            <div key={i} className="text-[11px] leading-5 whitespace-nowrap">
              <span style={{ color: "var(--muted)" }}>[{log.ts}]</span>
              {" "}
              <span style={{ color: LEVEL_COLORS[log.level] }}>[{log.level}]</span>
              {" "}
              <span style={{ color: "#c9d1d9" }}>{log.msg}</span>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}
