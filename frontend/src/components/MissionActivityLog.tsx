"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TelemetryLog } from "./TelemetryConsole";
import type { LogsResponse, LogsStats } from "@/app/api/logs/route";
import type { SystemLogRow } from "@/lib/supabase";

interface Props {
  logs: TelemetryLog[];
  /** Called by page.tsx after a transmit completes so the table re-fetches */
  refreshRef?: React.MutableRefObject<(() => void) | null>;
}

/* ── Display helpers ──────────────────────────────────────────────────────*/

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
  if (ms > 10_000) return "var(--red)";
  if (ms > 5_000)  return "var(--amber)";
  return "var(--emerald)";
}

function fmtLatency(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

function fmtTs(iso: string): string {
  // "2025-07-14T09:41:22.123Z" → "07-14 09:41:22Z"
  // Supabase may omit the Z suffix — ensure the string is parsed as UTC
  try {
    // If there's no timezone indicator, append Z so Date treats it as UTC
    const normalized = /[Zz]$|[+-]\d{2}:?\d{2}$/.test(iso.trim())
      ? iso
      : iso.replace(" ", "T") + "Z";
    const d = new Date(normalized);
    const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dy = String(d.getUTCDate()).padStart(2, "0");
    const hh = String(d.getUTCHours()).padStart(2, "0");
    const mm = String(d.getUTCMinutes()).padStart(2, "0");
    const ss = String(d.getUTCSeconds()).padStart(2, "0");
    return `${mo}-${dy} ${hh}:${mm}:${ss}Z`;
  } catch {
    return iso.slice(0, 19).replace("T", " ") + "Z";
  }
}

function agentRoute(agent: string): string {
  switch (agent) {
    case "sentinel":   return "router → sentinel → NeoWs";
    case "forecaster": return "router → forecaster → DONKI";
    case "archivist":  return "router → archivist → Supabase RAG";
    case "error":      return "router → error";
    default:           return `router → ${agent}`;
  }
}

/* ── Skeleton ─────────────────────────────────────────────────────────────*/
function Skeleton() {
  return (
    <div className="glass rounded-xl overflow-hidden">
      <div className="px-4 py-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="skeleton w-full h-3 rounded" />
      </div>
      {[1,2,3,4,5,6,7].map(i => (
        <div key={i} className="px-4 py-2.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          <div className="flex gap-4">
            <div className="skeleton w-32 h-3 rounded" />
            <div className="skeleton flex-1 h-3 rounded" />
            <div className="skeleton w-16 h-3 rounded" />
            <div className="skeleton w-16 h-3 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Stat card ────────────────────────────────────────────────────────────*/
function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg"
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <span className="text-[9px] font-mono tracking-widest uppercase" style={{ color: "var(--muted)" }}>
        {label}
      </span>
      <span className="text-[14px] font-mono font-bold tabular-nums shrink-0" style={{ color }}>
        {value}
      </span>
    </div>
  );
}

/* ── Empty state ──────────────────────────────────────────────────────────*/
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--muted)"
        strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" opacity={0.4}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10 9 9 9 8 9"/>
      </svg>
      <p className="font-mono text-[10px] text-center" style={{ color: "var(--muted)" }}>
        No queries logged yet.<br/>
        Run your first mission query to populate this log.
      </p>
    </div>
  );
}

/* ── Main component ───────────────────────────────────────────────────────*/
export default function MissionActivityLog({ logs, refreshRef }: Props) {
  const [data,        setData]        = useState<LogsResponse | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [syncedAt,    setSyncedAt]    = useState("");
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [setupRequired, setSetupRequired] = useState(false);

  // Keep a ref so fetchLogs always reads the latest filter without
  // needing to be recreated on every filter change (prevents stale closures)
  const filterRef = useRef(agentFilter);
  useEffect(() => { filterRef.current = agentFilter; }, [agentFilter]);

  // Stable fetch — never changes identity, always reads filterRef.current
  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const agent = filterRef.current;
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (agent !== "all") params.set("agent", agent);
      // cache: "no-store" prevents the browser from serving a stale cached
      // empty response from before the table existed
      const res  = await fetch(`/api/logs?${params}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json() as LogsResponse & { error?: string; setup_required?: boolean };
      if (json.error) throw new Error(json.error);
      setSetupRequired(json.setup_required === true);
      setData(json);
      const d = new Date();
      setSyncedAt(
        [d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()]
          .map(n => String(n).padStart(2, "0")).join(":") + " UTC"
      );
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load logs");
    } finally {
      setLoading(false);
    }
  }, []); // stable — no deps needed

  // Expose fetchLogs to parent via refreshRef so transmit can trigger a re-fetch
  useEffect(() => {
    if (refreshRef) refreshRef.current = fetchLogs;
  }, [fetchLogs, refreshRef]);

  // Re-fetch whenever the filter changes
  useEffect(() => { fetchLogs(); }, [agentFilter, fetchLogs]);

  // Poll every 30 s — single interval, never re-created
  useEffect(() => {
    const id = setInterval(fetchLogs, 30_000);
    return () => clearInterval(id);
  }, [fetchLogs]);

  const stats: LogsStats = data?.stats ?? {
    total_queries: 0, avg_latency_ms: 0,
    total_tokens: 0, error_count: 0, warn_count: 0,
  };
  const rows: SystemLogRow[] = data?.rows ?? [];

  const AGENT_FILTERS = [
    { id: "all",        label: "All Agents"  },
    { id: "sentinel",   label: "Sentinel"    },
    { id: "forecaster", label: "Forecaster"  },
    { id: "archivist",  label: "Archivist"   },
    { id: "error",      label: "Errors only" },
  ];

  // Success rate: (total - errors - warnings) / total * 100
  const successRate = stats.total_queries > 0
    ? (((stats.total_queries - stats.error_count - stats.warn_count) / stats.total_queries) * 100).toFixed(1)
    : "—";

  return (
    <div className="flex flex-col gap-4 animate-fade-in">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div className="flex flex-col min-w-0 flex-1">
          <p className="text-[11px] font-mono font-bold tracking-widest uppercase" style={{ color: "var(--cyan)" }}>
            Mission Activity Log
          </p>
          <p className="text-[10px] font-mono mt-0.5" style={{ color: "var(--muted)" }}>
            Live Supabase system_logs · agent routing history · latency
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {syncedAt && (
            <span className="font-mono text-[8px] tracking-widest px-2 py-0.5 rounded-full whitespace-nowrap"
              style={{ background: "rgba(0,210,230,0.08)", border: "1px solid rgba(0,210,230,0.2)", color: "var(--cyan)" }}>
              LIVE · {syncedAt}
            </span>
          )}
          <button
            type="button"
            onClick={fetchLogs}
            disabled={loading}
            className="font-mono text-[8px] px-2.5 py-1 rounded-full transition-all duration-200 shrink-0 whitespace-nowrap disabled:opacity-40"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: loading ? "var(--cyan)" : "var(--muted)" }}
            title="Refresh logs"
          >
            {loading ? "⟳ Syncing…" : "↻ Refresh"}
          </button>
        </div>
      </div>

      {/* ── Stats row — computed from real DB rows ───────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        <StatCard label="Total Queries"        value={stats.total_queries}              color="var(--cyan)"    />
        <StatCard label="Avg Latency"          value={fmtLatency(stats.avg_latency_ms)} color="var(--amber)"   />
        <StatCard label="Routing Success Rate" value={successRate === "—" ? "—" : `${successRate}%`} color="var(--emerald)" />
        <StatCard label="Errors"               value={stats.error_count}                color="var(--red)"     />
      </div>

      {/* ── Agent filter dropdown ─────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <span className="font-mono text-[9px] tracking-widest uppercase shrink-0" style={{ color: "var(--muted)" }}>
          Filter:
        </span>
        <select
          value={agentFilter}
          onChange={e => setAgentFilter(e.target.value)}
          className="font-mono text-[10px] px-3 py-1.5 rounded-lg outline-none cursor-pointer"
          style={{
            background:  "rgba(255,255,255,0.05)",
            border:      `1px solid ${
              agentFilter === "all"        ? "rgba(0,210,230,0.3)"  :
              agentFilter === "error"      ? "rgba(248,113,113,0.3)" :
              `${INTENT_COLOR[agentFilter] ?? "var(--cyan)"}55`
            }`,
            color: agentFilter === "all"   ? "var(--cyan)"
                 : agentFilter === "error" ? "var(--red)"
                 : INTENT_COLOR[agentFilter] ?? "var(--cyan)",
            appearance: "none",
            WebkitAppearance: "none",
            paddingRight: "2rem",
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%2364748b' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right 0.6rem center",
          }}
        >
          {AGENT_FILTERS.map(f => (
            <option key={f.id} value={f.id} style={{ background: "#0d1821", color: "#e2e8f0" }}>
              {f.label}
            </option>
          ))}
        </select>
        <span className="font-mono text-[9px] tabular-nums" style={{ color: "var(--muted)" }}>
          {rows.length > 0 ? `${rows.length} row${rows.length !== 1 ? "s" : ""}` : ""}
        </span>
      </div>

      {/* ── History table ────────────────────────────────────────────────── */}
      {loading ? <Skeleton /> : error ? (
        <div className="glass rounded-xl px-5 py-4 font-mono text-sm"
          style={{ color: "var(--red)", borderColor: "rgba(248,113,113,0.3)" }}>
          <span className="opacity-60 mr-2">[DB ERROR]</span>{error}
        </div>
      ) : setupRequired ? (
        <div className="glass rounded-xl px-5 py-6 flex flex-col items-center gap-3 text-center">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--amber)"
            strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" opacity={0.7}>
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <p className="font-mono text-[11px] font-bold tracking-widest uppercase" style={{ color: "var(--amber)" }}>
            Database Setup Required
          </p>
          <p className="font-mono text-[10px] max-w-md leading-relaxed" style={{ color: "var(--muted)" }}>
            The <span style={{ color: "var(--cyan)" }}>system_logs</span> table does not exist yet in your Supabase project.
            Run the migration SQL below in the{" "}
            <a
              href="https://supabase.com/dashboard/project/wpyhareaqlsrukapwqaw/sql/new"
              target="_blank" rel="noopener noreferrer"
              style={{ color: "var(--cyan)", textDecoration: "underline" }}
            >
              Supabase SQL Editor
            </a>{" "}
            to enable mission logging.
          </p>
          <div className="w-full max-w-2xl rounded-lg overflow-x-auto mt-1"
            style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.1)" }}>
            <pre className="px-4 py-3 font-mono text-[9px] text-left whitespace-pre leading-relaxed"
              style={{ color: "rgba(255,255,255,0.7)" }}>{`CREATE TABLE IF NOT EXISTS public.system_logs (
  id             bigserial     PRIMARY KEY,
  created_at     timestamptz   NOT NULL DEFAULT now(),
  query_string   text          NOT NULL DEFAULT '',
  resolved_agent text          NOT NULL DEFAULT 'error'
                               CHECK (resolved_agent IN ('sentinel','forecaster','archivist','error')),
  latency_ms     integer       NOT NULL DEFAULT 0,
  token_usage    integer       NOT NULL DEFAULT 0,
  status         text          NOT NULL DEFAULT 'OK'
                               CHECK (status IN ('OK','WARN','ERROR')),
  error_message  text
);
CREATE INDEX IF NOT EXISTS idx_system_logs_created_at
  ON public.system_logs (created_at DESC);
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;`}</pre>
          </div>
          <p className="font-mono text-[9px] mt-1" style={{ color: "var(--muted)" }}>
            After running the SQL, click ↻ Refresh above — the log will activate automatically.
          </p>
        </div>
      ) : rows.length === 0 ? (
        <div className="glass rounded-xl overflow-hidden"><EmptyState /></div>
      ) : (
        <div className="glass rounded-xl overflow-hidden">
          {/* Sticky column headers */}
          <div className="grid font-mono text-[9px] tracking-widest uppercase px-4 py-2 sticky top-0 z-10"
            style={{
              gridTemplateColumns: "140px 1fr 80px 80px 60px",
              color: "var(--muted)",
              background: "#0d1821",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
            }}>
            <span>Timestamp</span>
            <span>Query / Route</span>
            <span>Agent</span>
            <span>Latency</span>
            <span>Status</span>
          </div>

          {/* Scrollable rows — max 600px, custom scrollbar matching system palette */}
          <style>{`
            .log-scroll::-webkit-scrollbar { width: 4px; }
            .log-scroll::-webkit-scrollbar-track { background: transparent; }
            .log-scroll::-webkit-scrollbar-thumb { background: rgba(0,210,230,0.2); border-radius: 2px; }
            .log-scroll::-webkit-scrollbar-thumb:hover { background: rgba(0,210,230,0.4); }
          `}</style>
          <div className="log-scroll overflow-y-auto" style={{
            maxHeight: 600,
            scrollbarWidth: "thin",
            scrollbarColor: "rgba(0,210,230,0.2) transparent",
          }}>
            {rows.map((row, i) => (
              <div
                key={row.id}
                className="grid items-start px-4 py-2.5 font-mono text-[10px]"
                style={{
                  gridTemplateColumns: "140px 1fr 80px 80px 60px",
                  background:   i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)",
                  borderBottom: i < rows.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                  borderLeft:   row.status === "ERROR" ? "2px solid var(--red)"
                              : row.status === "WARN"  ? "2px solid var(--amber)"
                              : "2px solid transparent",
                }}
              >
                <span className="tabular-nums" style={{ color: "var(--muted)" }}>
                  {fmtTs(row.created_at)}
                </span>
                <div className="flex flex-col pr-4 min-w-0">
                  <span className="truncate" style={{ color: "rgba(255,255,255,0.8)" }}>
                    {row.query_string || <em style={{ opacity: 0.4 }}>empty query</em>}
                  </span>
                  <span className="text-[9px] truncate mt-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>
                    {agentRoute(row.resolved_agent)}
                    {row.error_message && (
                      <span style={{ color: "var(--red)" }}> · {row.error_message}</span>
                    )}
                  </span>
                </div>
                <span className="font-bold uppercase text-[9px]"
                  style={{ color: INTENT_COLOR[row.resolved_agent] ?? "var(--muted)" }}>
                  {row.resolved_agent}
                </span>
                <span className="tabular-nums" style={{ color: latencyColor(row.latency_ms) }}>
                  {fmtLatency(row.latency_ms)}
                </span>
                <span className="font-bold text-[9px]" style={{ color: STATUS_COLOR[row.status] }}>
                  {row.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Current session console (live telemetry from this page session) */}
      {logs.length > 0 && (
        <div className="glass rounded-xl p-4">
          <p className="text-[10px] font-mono tracking-widest uppercase mb-3" style={{ color: "var(--cyan)" }}>
            Current Session · In-Memory Telemetry
          </p>
          <div className="flex flex-col gap-1">
            {logs.map((l, i) => {
              const c = l.level === "WARN"  ? "var(--red)"
                      : l.level === "OK"    ? "var(--emerald)"
                      : l.level === "ROUTE" ? "var(--cyan)"
                      : "rgba(255,255,255,0.5)";
              return (
                <div key={i} className="flex gap-3 text-[10px] font-mono">
                  <span className="tabular-nums shrink-0" style={{ color: "var(--muted)" }}>{l.ts}</span>
                  <span className="shrink-0 w-12" style={{ color: c }}>[{l.level}]</span>
                  <span style={{ color: "rgba(255,255,255,0.7)" }}>{l.msg}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <p className="text-[9px] font-mono" style={{ color: "var(--muted)" }}>
        Source: Supabase system_logs · Every query through the watsonx router writes a real row ·
        Polling every 30 s · Success rate = (total − errors − warnings) / total
      </p>
    </div>
  );
}
