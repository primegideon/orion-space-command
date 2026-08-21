"use client";

import type { TelemetryLog } from "./TelemetryConsole";

interface Props {
  logs: TelemetryLog[];
}

/* ── Static mission history — deterministic seed ──────────────────────── */
interface HistoryEntry {
  id: string;
  ts: string;
  query: string;
  intent: "sentinel" | "forecaster" | "archivist" | "error";
  latency: number;    // ms
  route: string;
  tokens: number;
  bytes: number;
  status: "OK" | "WARN" | "ERROR";
}

const HISTORY: HistoryEntry[] = [
  { id: "h1",  ts: "2025-07-14 09:41:22Z", query: "show me hazardous asteroids",          intent: "sentinel",   latency: 3240, route: "router → sentinel → NeoWs",         tokens: 812,  bytes: 4820, status: "OK"   },
  { id: "h2",  ts: "2025-07-14 09:38:05Z", query: "latest solar flares this week",         intent: "forecaster", latency: 2810, route: "router → forecaster → DONKI",       tokens: 634,  bytes: 3910, status: "OK"   },
  { id: "h3",  ts: "2025-07-14 09:31:48Z", query: "what is the Kessler syndrome",          intent: "archivist",  latency: 5102, route: "router → archivist → Supabase RAG", tokens: 1540, bytes: 7340, status: "OK"   },
  { id: "h4",  ts: "2025-07-14 09:22:19Z", query: "CME arrival time prediction",           intent: "forecaster", latency: 2990, route: "router → forecaster → DONKI",       tokens: 720,  bytes: 4120, status: "OK"   },
  { id: "h5",  ts: "2025-07-14 09:14:33Z", query: "near earth objects next 7 days",        intent: "sentinel",   latency: 3480, route: "router → sentinel → NeoWs",         tokens: 895,  bytes: 5210, status: "OK"   },
  { id: "h6",  ts: "2025-07-14 08:59:07Z", query: "explain geomagnetic storm effects",     intent: "archivist",  latency: 4870, route: "router → archivist → Supabase RAG", tokens: 1820, bytes: 9100, status: "OK"   },
  { id: "h7",  ts: "2025-07-14 08:44:50Z", query: "X-class flare impact on GPS",          intent: "forecaster", latency: 18200,route: "router → forecaster → DONKI",       tokens: 710,  bytes: 3850, status: "WARN" },
  { id: "h8",  ts: "2025-07-14 08:31:12Z", query: "asteroid 2014 UR116 orbital data",     intent: "sentinel",   latency: 3100, route: "router → sentinel → NeoWs",         tokens: 788,  bytes: 4510, status: "OK"   },
  { id: "h9",  ts: "2025-07-14 08:20:44Z", query: "supabase connection test",              intent: "error",      latency: 420,  route: "router → error",                    tokens: 112,  bytes: 290,  status: "ERROR"},
  { id: "h10", ts: "2025-07-14 08:11:03Z", query: "solar wind speed and density forecast", intent: "forecaster", latency: 3310, route: "router → forecaster → DONKI",       tokens: 680,  bytes: 3990, status: "OK"   },
];

const INTENT_COLOR: Record<string, string> = {
  sentinel:   "var(--cyan)",
  forecaster: "#fb923c",
  archivist:  "var(--emerald)",
  error:      "var(--red)",
};

const STATUS_COLOR: Record<string, string> = {
  OK:    "var(--emerald)",
  WARN:  "var(--amber)",
  ERROR: "var(--red)",
};

function latencyColor(ms: number): string {
  if (ms > 10000) return "var(--red)";
  if (ms > 5000)  return "var(--amber)";
  return "var(--emerald)";
}

export default function MissionActivityLog({ logs }: Props) {
  return (
    <div className="flex flex-col gap-4 animate-fade-in">

      {/* Header */}
      <div>
        <p className="text-[11px] font-mono font-bold tracking-widest uppercase" style={{ color: "var(--cyan)" }}>
          Mission Activity Log
        </p>
        <p className="text-[10px] font-mono mt-0.5" style={{ color: "var(--muted)" }}>
          Agent routing history · latency · token usage
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {[
          { label: "Total Queries", value: HISTORY.length,                                                                    color: "var(--cyan)"    },
          { label: "Avg Latency",   value: `${Math.round(HISTORY.reduce((a,h)=>a+h.latency,0)/HISTORY.length/100)/10}s`,      color: "var(--amber)"   },
          { label: "Total Tokens",  value: HISTORY.reduce((a,h)=>a+h.tokens,0).toLocaleString(),                              color: "var(--emerald)" },
          { label: "Errors",        value: HISTORY.filter(h=>h.status==="ERROR").length,                                      color: "var(--red)"     },
          { label: "Warnings",      value: HISTORY.filter(h=>h.status==="WARN").length,                                       color: "#fb923c"        },
        ].map((s) => (
          <div key={s.label} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <span className="text-[9px] font-mono tracking-widest uppercase" style={{ color: "var(--muted)" }}>{s.label}</span>
            <span className="text-[14px] font-mono font-bold tabular-nums shrink-0" style={{ color: s.color }}>{s.value}</span>
          </div>
        ))}
      </div>

      {/* History table */}
      <div className="glass rounded-xl overflow-hidden">
        <div className="grid font-mono text-[9px] tracking-widest uppercase px-4 py-2"
          style={{
            gridTemplateColumns: "140px 1fr 80px 80px 70px 70px 60px",
            color: "var(--muted)",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}>
          <span>Timestamp</span>
          <span>Query</span>
          <span>Agent</span>
          <span>Latency</span>
          <span>Tokens</span>
          <span>Bytes</span>
          <span>Status</span>
        </div>

        {HISTORY.map((h, i) => (
          <div
            key={h.id}
            className="grid items-start px-4 py-2.5 font-mono text-[10px]"
            style={{
              gridTemplateColumns: "140px 1fr 80px 80px 70px 70px 60px",
              background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)",
              borderBottom: i < HISTORY.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
            }}
          >
            <span className="tabular-nums" style={{ color: "var(--muted)" }}>{h.ts}</span>
            <div className="flex flex-col pr-4">
              <span className="truncate" style={{ color: "rgba(255,255,255,0.8)" }}>{h.query}</span>
              <span className="text-[9px] truncate mt-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>{h.route}</span>
            </div>
            <span className="font-bold uppercase text-[9px]" style={{ color: INTENT_COLOR[h.intent] }}>{h.intent}</span>
            <span className="tabular-nums" style={{ color: latencyColor(h.latency) }}>
              {h.latency >= 1000 ? `${(h.latency / 1000).toFixed(1)}s` : `${h.latency}ms`}
            </span>
            <span className="tabular-nums" style={{ color: "rgba(255,255,255,0.5)" }}>{h.tokens.toLocaleString()}</span>
            <span className="tabular-nums" style={{ color: "rgba(255,255,255,0.5)" }}>{(h.bytes / 1000).toFixed(1)} KB</span>
            <span className="font-bold text-[9px]" style={{ color: STATUS_COLOR[h.status] }}>{h.status}</span>
          </div>
        ))}
      </div>

      {/* Live session console */}
      {logs.length > 0 && (
        <div className="glass rounded-xl p-4">
          <p className="text-[10px] font-mono tracking-widest uppercase mb-3" style={{ color: "var(--cyan)" }}>
            Current Session
          </p>
          <div className="flex flex-col gap-1">
            {logs.map((l, i) => {
              const c = l.level === "WARN" ? "var(--red)" : l.level === "OK" ? "var(--emerald)" : l.level === "ROUTE" ? "var(--cyan)" : "rgba(255,255,255,0.5)";
              return (
                <div key={i} className="flex gap-3 text-[10px] font-mono">
                  <span className="tabular-nums shrink-0" style={{ color: "var(--muted)" }}>{l.ts}</span>
                  <span className="shrink-0 w-10" style={{ color: c }}>[{l.level}]</span>
                  <span style={{ color: "rgba(255,255,255,0.7)" }}>{l.msg}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p className="text-[9px] font-mono" style={{ color: "var(--muted)" }}>
        Simulated historical log · Current session entries appended live from active watsonx routing
      </p>
    </div>
  );
}
