"use client";

import { useCallback, useEffect, useState } from "react";
import {
  LineChart, Line, BarChart, Bar, RadarChart, Radar,
  PolarGrid, PolarAngleAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import AdvancedThreatMatrix from "./AdvancedThreatMatrix";
import KpStatusBanner from "./KpStatusBanner";
import type { ForecasterData } from "./ForecasterPanel";
import type { ArchivistData } from "./ArchivistPanel";
import type { AnalyticsResponse, AnalyticsMetrics } from "@/app/api/analytics/route";

interface Props {
  forecaster: ForecasterData | null;
  exporting: boolean;
  archivist: ArchivistData | null;
  archivistLoading: boolean;
}

/* ── Chart style constants ────────────────────────────────────────────────*/
const TOOLTIP_STYLE = {
  background: "#0d1821",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8,
  color: "#e2e8f0",
  fontSize: 11,
  fontFamily: "monospace",
};

/* ── Tabs ─────────────────────────────────────────────────────────────────*/
const TABS = [
  { id: "historical", label: "Historical" },
  { id: "threat",     label: "Threat Matrix" },
] as const;
type TabId = typeof TABS[number]["id"];

/* ── Mitigation protocol definitions ─────────────────────────────────────*/
interface Protocol {
  id:       string;
  title:    string;
  trigger:  string;
  action:   string;
  severity: string;
  /** Returns true when live telemetry meets this protocol's threshold */
  isActive: (m: AnalyticsMetrics) => boolean;
}

const PROTOCOLS: Protocol[] = [
  {
    id:       "rad",
    title:    "Radiation Shielding Protocol",
    trigger:  "X-class flare or S3+ event",
    action:   "Activate secondary shielding on LEO assets; pause EVAs; reduce SAA crossings.",
    severity: "var(--red)",
    isActive: (m) => m.xCount > 0 || (m.worstFlareClass?.toUpperCase().startsWith("X") ?? false),
  },
  {
    id:       "blackout",
    title:    "HF Radio Blackout Response",
    trigger:  "R3+ radio blackout event (M5+ flare)",
    action:   "Switch comm links to UHF/SHF; notify aviation operators; enable backup channels.",
    severity: "#fb923c",
    isActive: (m) => {
      const cls = (m.worstFlareClass ?? "").toUpperCase();
      const letter = cls.charAt(0);
      const num    = parseFloat(cls.slice(1)) || 0;
      return letter === "X" || (letter === "M" && num >= 5);
    },
  },
  {
    id:       "pho",
    title:    "PHO Proximity Alert",
    trigger:  "Any PHO in 30-day close-approach window",
    action:   "Elevate insurance watch; brief orbital operators; verify debris field tracking.",
    severity: "var(--amber)",
    isActive: (m) => m.phoCount > 0,
  },
  {
    id:       "geo",
    title:    "Geomagnetic Storm Prep",
    trigger:  "Kp ≥ 5 (G1+)",
    action:   "Power grid operators on standby; drag compensation on LEO sats; GPS correction active.",
    severity: "var(--cyan)",
    isActive: (m) => (m.kpCurrent ?? 0) >= 5,
  },
];

/* ── Stat card ────────────────────────────────────────────────────────────*/
function StatCard({
  label, value, sub, color, loading,
}: {
  label: string; value: string | number; sub?: string; color: string; loading?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg"
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-[9px] font-mono tracking-widest uppercase leading-none"
          style={{ color: "var(--muted)" }}>{label}</span>
        {sub && (
          <span className="text-[9px] font-mono leading-none"
            style={{ color: "rgba(255,255,255,0.3)" }}>{sub}</span>
        )}
      </div>
      {loading ? (
        <div className="skeleton w-10 h-4 rounded ml-auto shrink-0" />
      ) : (
        <span className="text-[15px] font-mono font-bold tabular-nums shrink-0 ml-auto"
          style={{ color }}>{value}</span>
      )}
    </div>
  );
}

/* ── Chart skeleton ───────────────────────────────────────────────────────*/
function ChartSkeleton({ height = 200 }: { height?: number }) {
  return (
    <div className="animate-pulse rounded-lg w-full"
      style={{ height, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }} />
  );
}

/* ── Protocol card ────────────────────────────────────────────────────────*/
function ProtocolCard({ p, active, loading }: { p: Protocol; active: boolean; loading: boolean }) {
  return (
    <div
      className="glass rounded-xl p-4 transition-all duration-500"
      style={{
        borderLeft:  `3px solid ${active ? p.severity : "rgba(255,255,255,0.08)"}`,
        opacity:     loading ? 0.6 : active ? 1 : 0.45,
        background:  active ? `${p.severity}08` : undefined,
        boxShadow:   active ? `inset 0 0 24px ${p.severity}0a` : undefined,
      }}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <p className="font-mono font-semibold text-xs tracking-wide"
          style={{ color: active ? p.severity : "rgba(255,255,255,0.4)" }}>
          {p.title}
        </p>
        {!loading && (
          <span
            className="shrink-0 font-mono text-[8px] font-bold tracking-widest px-1.5 py-0.5 rounded-full"
            style={{
              background: active ? `${p.severity}22` : "rgba(255,255,255,0.04)",
              border:     `1px solid ${active ? p.severity + "55" : "rgba(255,255,255,0.08)"}`,
              color:      active ? p.severity : "rgba(255,255,255,0.25)",
            }}
          >
            {active ? "● ACTIVE" : "○ STANDBY"}
          </span>
        )}
      </div>
      <p className="text-[10px] font-mono mb-2" style={{ color: "var(--muted)" }}>
        Trigger: {p.trigger}
      </p>
      <p className="text-[11px] font-mono leading-relaxed"
        style={{ color: active ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.4)" }}>
        {p.action}
      </p>
    </div>
  );
}

/* ── Radar chart data — derived from live metrics ─────────────────────────*/
function buildRadar(m: AnalyticsMetrics | null) {
  // Normalise each axis 0–100 against rough real-world maxima
  const clamp = (v: number, max: number) => Math.min(100, Math.round((v / max) * 100));
  if (!m) {
    return [
      { subject: "X-Flare",   current: 0, avg: 15 },
      { subject: "CME",       current: 0, avg: 30 },
      { subject: "PHO",       current: 0, avg: 20 },
      { subject: "Radiation", current: 0, avg: 25 },
      { subject: "GeoMag",    current: 0, avg: 30 },
      { subject: "GPS",       current: 0, avg: 20 },
    ];
  }
  return [
    { subject: "X-Flare",   current: clamp(m.xCount, 5),            avg: 15 },
    { subject: "CME",       current: clamp(m.maxCmeSpeed, 3000),     avg: 30 },
    { subject: "PHO",       current: clamp(m.phoCount, 20),          avg: 20 },
    { subject: "Radiation", current: clamp(m.mCount + m.xCount * 3, 20), avg: 25 },
    { subject: "GeoMag",    current: clamp((m.kpCurrent ?? 0), 9) * 11, avg: 30 },
    { subject: "GPS",       current: clamp(m.xCount * 15 + (m.kpCurrent ?? 0) * 5, 100), avg: 20 },
  ];
}

/* ── Main component ───────────────────────────────────────────────────────*/
export default function AnalyticsView({
  forecaster, exporting, archivist, archivistLoading,
}: Props) {
  const [tab, setTab] = useState<TabId>("historical");

  const [analytics, setAnalytics]     = useState<AnalyticsResponse | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [isBusting,  setIsBusting]   = useState(false);
  const [fetchError,  setFetchError]  = useState<string | null>(null);
  const [syncedAt,    setSyncedAt]    = useState("");

  /** Normal load — serves from server TTL cache if fresh (≤15 min) */
  const load = useCallback(async (bust = false) => {
    setLoadingData(true);
    try {
      const url = bust ? "/api/analytics?bust=1" : "/api/analytics";
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json() as AnalyticsResponse;
      setAnalytics(json);
      const d = new Date();
      setSyncedAt(
        [d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()]
          .map(n => String(n).padStart(2, "0")).join(":") + " UTC"
      );
      setFetchError(null);
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : "Analytics fetch failed");
    } finally {
      setLoadingData(false);
      setIsBusting(false);
    }
  }, []);

  /** Manual refresh — bypasses the 15-min TTL cache */
  const handleRefresh = useCallback(() => {
    if (loadingData) return;
    setIsBusting(true);
    load(true);
  }, [load, loadingData]);

  // Load when the historical tab is first shown, then every 15 min (matches TTL)
  useEffect(() => {
    if (tab !== "historical") return;
    load(false);
    const id = setInterval(() => load(false), 15 * 60 * 1000);
    return () => clearInterval(id);
  }, [tab, load]);

  const m = analytics?.metrics ?? null;
  const flareChart = analytics?.flareChart ?? [];
  const cmeChart   = analytics?.cmeChart   ?? [];
  const radarData  = buildRadar(m);

  // CME chart with zeros filtered to gaps so the bar chart looks clean
  const cmeChartFiltered = cmeChart.map(d => ({ ...d, speed: d.speed > 0 ? d.speed : null }));

  return (
    <div className="flex flex-col gap-5 py-2 animate-fade-in">

      {/* ── Mode selector — full width ───────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2">
        {/* Historical Analytics */}
        <button
          onClick={() => setTab("historical")}
          className="flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all duration-200"
          style={{
            background: tab === "historical" ? "rgba(0,210,230,0.07)" : "rgba(255,255,255,0.02)",
            border:     tab === "historical" ? "1px solid rgba(0,210,230,0.3)" : "1px solid rgba(255,255,255,0.07)",
          }}
        >
          {/* Icon */}
          <div className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: tab === "historical" ? "rgba(0,210,230,0.12)" : "rgba(255,255,255,0.04)" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke={tab === "historical" ? "var(--cyan)" : "rgba(255,255,255,0.3)"}
              strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[11px] font-mono font-bold tracking-widest uppercase"
              style={{ color: tab === "historical" ? "var(--cyan)" : "rgba(255,255,255,0.5)" }}>
              Historical
            </span>
            <span className="text-[9px] font-mono mt-0.5"
              style={{ color: "rgba(255,255,255,0.25)" }}>
              30-day flare · CME · radar analytics
            </span>
          </div>
          {tab === "historical" && (
            <span className="ml-auto shrink-0 text-[8px] font-mono px-1.5 py-0.5 rounded"
              style={{ background: "rgba(0,210,230,0.1)", border: "1px solid rgba(0,210,230,0.2)", color: "var(--cyan)" }}>
              ACTIVE
            </span>
          )}
        </button>

        {/* Threat Matrix */}
        <button
          onClick={() => setTab("threat")}
          className="flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all duration-200"
          style={{
            background: tab === "threat" ? "rgba(248,113,113,0.06)" : "rgba(255,255,255,0.02)",
            border:     tab === "threat" ? "1px solid rgba(248,113,113,0.28)" : "1px solid rgba(255,255,255,0.07)",
          }}
        >
          {/* Live pulse dot */}
          <div className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: tab === "threat" ? "rgba(248,113,113,0.1)" : "rgba(255,255,255,0.04)" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke={tab === "threat" ? "var(--red)" : "rgba(255,255,255,0.3)"}
              strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-mono font-bold tracking-widest uppercase"
                style={{ color: tab === "threat" ? "var(--red)" : "rgba(255,255,255,0.5)" }}>
                Threat Matrix
              </span>
              {/* Live pulse indicator */}
              <span className="w-1.5 h-1.5 rounded-full shrink-0 animate-pulse"
                style={{ background: "var(--red)" }} />
            </div>
            <span className="text-[9px] font-mono mt-0.5"
              style={{ color: "rgba(255,255,255,0.25)" }}>
              Orbital debris · solar wind · RF spectrum
            </span>
          </div>
          {tab === "threat" && (
            <span className="ml-auto shrink-0 text-[8px] font-mono px-1.5 py-0.5 rounded"
              style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", color: "var(--red)" }}>
              LIVE
            </span>
          )}
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
       *  HISTORICAL VIEW
       * ════════════════════════════════════════════════════════════════*/}
      {tab === "historical" && (
        <>
          {/* Live Kp banner */}
          <KpStatusBanner />

          {/* Hard fetch error */}
          {fetchError && (
            <div className="glass rounded-xl px-4 py-2.5 font-mono text-[10px]"
              style={{ color: "var(--amber)", borderColor: "rgba(251,191,36,0.3)" }}>
              ⚠ {fetchError}
            </div>
          )}

          {/* Per-source errors from the API (partial failures) */}
          {!fetchError && analytics?.errors && analytics.errors.length > 0 && (
            <div className="glass rounded-xl px-4 py-2 flex flex-col gap-1"
              style={{ borderColor: "rgba(251,191,36,0.25)" }}>
              <span className="font-mono text-[9px] tracking-widest uppercase"
                style={{ color: "var(--amber)" }}>
                ⚠ {analytics.errors.length} data source{analytics.errors.length > 1 ? "s" : ""} unavailable — showing partial data
              </span>
              {analytics.errors.map((e, i) => (
                <span key={i} className="font-mono text-[9px]" style={{ color: "rgba(251,191,36,0.7)" }}>
                  · {e}
                </span>
              ))}
            </div>
          )}

          {/* Header row with sync timestamp */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-[10px] font-mono" style={{ color: "var(--muted)" }}>
              30-day window · NASA DONKI + NeoWs · live aggregates
            </p>
            <div className="flex items-center gap-2">
              {syncedAt && (
                <span className="font-mono text-[8px] tracking-widest px-2 py-0.5 rounded-full"
                  style={{ background: "rgba(0,210,230,0.08)", border: "1px solid rgba(0,210,230,0.2)", color: "var(--cyan)" }}>
                  SYNCED {syncedAt}
                </span>
              )}
              <button
                type="button"
                onClick={handleRefresh}
                disabled={loadingData}
                className="font-mono text-[8px] px-2.5 py-1 rounded-full transition-all duration-200 whitespace-nowrap disabled:opacity-40"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: isBusting ? "var(--cyan)" : "var(--muted)" }}
              >
                {isBusting ? "⟳ Syncing…" : "↻ Refresh"}
              </button>
            </div>
          </div>

          {/* ── Top metrics ─────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            <StatCard
              label="30-day flares"  sub="B+C+M+X · DONKI"
              value={m?.totalFlares ?? 0}
              color="var(--cyan)"    loading={loadingData}
            />
            <StatCard
              label="X-class events" sub="last 30 days"
              value={m?.xCount ?? 0}
              color="var(--red)"     loading={loadingData}
            />
            <StatCard
              label="Peak CME speed" sub="30-day window"
              value={m?.maxCmeSpeed ? `${m.maxCmeSpeed} km/s` : "—"}
              color="#fb923c"        loading={loadingData}
            />
            <StatCard
              label="PHO approaches" sub="30-day window"
              value={m?.phoCount ?? 0}
              color="var(--emerald)" loading={loadingData}
            />
          </div>

          {/* ── Charts row ──────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* Flare Frequency line chart */}
            <div className="glass rounded-xl p-4 lg:col-span-2" style={{ minHeight: 260 }}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[11px] font-mono tracking-widest uppercase"
                  style={{ color: "var(--cyan)" }}>
                  Flare Frequency · 30 Days
                </p>
                {!loadingData && analytics && (
                  <span className="font-mono text-[8px]" style={{ color: "var(--muted)" }}>
                    {analytics.startDate} → {analytics.endDate}
                  </span>
                )}
              </div>
              {loadingData ? <ChartSkeleton height={200} /> : (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={flareChart} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis
                      dataKey="day"
                      tick={{ fill: "#64748b", fontSize: 9, fontFamily: "monospace" }}
                      interval={6}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fill: "#64748b", fontSize: 9, fontFamily: "monospace" }}
                    />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Legend wrapperStyle={{ fontSize: 10, fontFamily: "monospace", color: "#94a3b8" }} />
                    <Line type="monotone" dataKey="B" stroke="#475569"      dot={false} strokeWidth={1}   />
                    <Line type="monotone" dataKey="C" stroke="var(--amber)" dot={false} strokeWidth={1.5} />
                    <Line type="monotone" dataKey="M" stroke="#fb923c"      dot={false} strokeWidth={2}   />
                    <Line type="monotone" dataKey="X" stroke="var(--red)"   dot={false} strokeWidth={2.5} />
                  </LineChart>
                </ResponsiveContainer>
              )}
              {!loadingData && flareChart.every(d => d.B + d.C + d.M + d.X === 0) && (
                <p className="text-[10px] font-mono mt-2 text-center" style={{ color: "var(--muted)" }}>
                  No flares recorded in this window — solar activity is quiet.
                </p>
              )}
            </div>

            {/* Risk Radar — axes derived from live metrics */}
            <div className="glass rounded-xl p-4" style={{ minHeight: 260 }}>
              <p className="text-[11px] font-mono tracking-widest uppercase mb-3"
                style={{ color: "var(--cyan)" }}>
                Risk Radar · Live vs Baseline
              </p>
              {loadingData ? <ChartSkeleton height={200} /> : (
                <ResponsiveContainer width="100%" height={200}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="rgba(255,255,255,0.07)" />
                    <PolarAngleAxis
                      dataKey="subject"
                      tick={{ fill: "#64748b", fontSize: 9, fontFamily: "monospace" }}
                    />
                    <Radar
                      name="Live"     dataKey="current"
                      stroke="var(--cyan)"  fill="var(--cyan)"  fillOpacity={0.18} strokeWidth={1.5}
                    />
                    <Radar
                      name="Baseline" dataKey="avg"
                      stroke="var(--amber)" fill="var(--amber)" fillOpacity={0.10}
                      strokeWidth={1} strokeDasharray="4 3"
                    />
                    <Legend wrapperStyle={{ fontSize: 10, fontFamily: "monospace", color: "#94a3b8" }} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                  </RadarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* ── CME Speed bar chart ──────────────────────────────────────── */}
          <div className="glass rounded-xl p-4" style={{ minHeight: 220 }}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] font-mono tracking-widest uppercase"
                style={{ color: "var(--cyan)" }}>
                CME Propagation Speed · 30-Day Window (km/s)
              </p>
              {!loadingData && m && m.maxCmeSpeed > 0 && (
                <span className="font-mono text-[9px]" style={{ color: "#fb923c" }}>
                  Peak: {m.maxCmeSpeed.toLocaleString()} km/s
                </span>
              )}
            </div>
            {loadingData ? <ChartSkeleton height={160} /> : (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={cmeChartFiltered} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis
                    dataKey="day"
                    tick={{ fill: "#64748b", fontSize: 9, fontFamily: "monospace" }}
                    interval={6}
                  />
                  <YAxis
                    tick={{ fill: "#64748b", fontSize: 9, fontFamily: "monospace" }}
                    allowDataOverflow
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(v) => [`${Number(v).toLocaleString()} km/s`, "Speed"]}
                  />
                  <Bar dataKey="speed" fill="var(--cyan)" fillOpacity={0.7} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
            {!loadingData && cmeChart.every(d => d.speed === 0) && (
              <p className="text-[10px] font-mono mt-2 text-center" style={{ color: "var(--muted)" }}>
                No CME data returned for this window.
              </p>
            )}
          </div>

          {/* ── Mitigation Protocols — live-activated ───────────────────── */}
          <div>
            <div className="flex items-center gap-3 mb-3">
              <p className="text-[11px] font-mono tracking-widest uppercase"
                style={{ color: "var(--muted)" }}>
                Standard Mitigation Protocols
              </p>
              {!loadingData && m && (
                <span className="font-mono text-[9px] px-2 py-0.5 rounded-full"
                  style={{
                    background: PROTOCOLS.some(p => p.isActive(m))
                      ? "rgba(248,113,113,0.12)" : "rgba(255,255,255,0.04)",
                    border: PROTOCOLS.some(p => p.isActive(m))
                      ? "1px solid rgba(248,113,113,0.3)" : "1px solid rgba(255,255,255,0.08)",
                    color: PROTOCOLS.some(p => p.isActive(m))
                      ? "var(--red)" : "var(--muted)",
                  }}>
                  {PROTOCOLS.filter(p => p.isActive(m)).length} protocol
                  {PROTOCOLS.filter(p => p.isActive(m)).length !== 1 ? "s" : ""} active
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {PROTOCOLS.map((p) => (
                <ProtocolCard
                  key={p.id}
                  p={p}
                  active={!loadingData && m !== null && p.isActive(m)}
                  loading={loadingData}
                />
              ))}
            </div>
            {!loadingData && m && (
              <p className="text-[9px] font-mono mt-2" style={{ color: "var(--muted)" }}>
                Live conditions: Kp {m.kpCurrent?.toFixed(2) ?? "—"} ({m.kpStatus ?? "—"}) ·
                Worst flare: {m.worstFlareClass ?? "none"} ·
                {m.phoCount} PHO approach{m.phoCount !== 1 ? "es" : ""} · 30-day window
              </p>
            )}
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════
       *  THREAT MATRIX VIEW
       * ════════════════════════════════════════════════════════════════*/}
      {tab === "threat" && (
        <AdvancedThreatMatrix
          forecaster={forecaster}
          exporting={exporting}
          archivist={archivist}
          archivistLoading={archivistLoading}
        />
      )}
    </div>
  );
}
