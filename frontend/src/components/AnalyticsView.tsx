"use client";

import { useState } from "react";
import {
  LineChart, Line, BarChart, Bar, RadarChart, Radar,
  PolarGrid, PolarAngleAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import AdvancedThreatMatrix from "./AdvancedThreatMatrix";
import type { ForecasterData } from "./ForecasterPanel";

interface Props {
  forecaster: ForecasterData | null;
  exporting: boolean;
}

/* ── Mock 90-day historical data ────────────────────────────────────────── */
const DAYS = Array.from({ length: 90 }, (_, i) => {
  const d = new Date();
  d.setDate(d.getDate() - (89 - i));
  return d.toISOString().slice(5, 10);
});

const flareFreq = DAYS.map((day, i) => ({
  day,
  X: i % 23 === 0 ? 1 : 0,
  M: i % 11 === 0 ? 2 : i % 17 === 0 ? 1 : 0,
  C: Math.round(2 + Math.sin(i / 5) * 1.5),
  B: Math.round(3 + Math.cos(i / 4) * 2),
}));

const cmeSpeeds = DAYS.slice(-30).map((day, i) => ({
  day,
  speed: Math.round(600 + Math.sin(i / 3) * 250 + (((i * 17 + 3) % 11) * 9)),
}));

const riskRadar = [
  { subject: "X-Flare",   current: 62, avg: 38 },
  { subject: "CME",       current: 45, avg: 42 },
  { subject: "PHO",       current: 30, avg: 25 },
  { subject: "Radiation", current: 55, avg: 48 },
  { subject: "GeoMag",    current: 70, avg: 50 },
  { subject: "GPS",       current: 40, avg: 35 },
];

const totalFlares = flareFreq.reduce((acc, d) => acc + d.X + d.M + d.C + d.B, 0);
const xCount      = flareFreq.filter((d) => d.X > 0).length;
const maxCme      = Math.max(...cmeSpeeds.map((d) => d.speed));

const MITIGATION_PROTOCOLS = [
  { id: "rad",     title: "Radiation Shielding Protocol",  trigger: "X-class flare or S3+ event",       action: "Activate secondary shielding on LEO assets; pause EVAs; reduce SAA crossings.",                 severity: "var(--red)" },
  { id: "blackout",title: "HF Radio Blackout Response",    trigger: "R3+ radio blackout event",          action: "Switch comm links to UHF/SHF; notify aviation operators; enable backup channels.",             severity: "#fb923c" },
  { id: "pho",     title: "PHO Proximity Alert",           trigger: "Miss distance < 1 LD (384,400 km)", action: "Elevate insurance watch; brief orbital operators; verify debris field tracking.",              severity: "var(--amber)" },
  { id: "geo",     title: "Geomagnetic Storm Prep",        trigger: "Kp ≥ 6 (G2+)",                     action: "Power grid operators on standby; drag compensation on LEO sats; GPS correction active.",       severity: "var(--cyan)" },
];

const TOOLTIP_STYLE = {
  background: "#0d1821",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8,
  color: "#e2e8f0",
  fontSize: 11,
  fontFamily: "monospace",
};

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div
      className="flex items-center gap-3 px-3 py-2 rounded-lg"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-[9px] font-mono tracking-widest uppercase leading-none" style={{ color: "var(--muted)" }}>{label}</span>
        {sub && <span className="text-[9px] font-mono leading-none" style={{ color: "rgba(255,255,255,0.3)" }}>{sub}</span>}
      </div>
      <span className="text-[15px] font-mono font-bold tabular-nums shrink-0 ml-auto" style={{ color }}>{value}</span>
    </div>
  );
}

const TABS = [
  { id: "historical", label: "Historical" },
  { id: "threat",     label: "Threat Matrix" },
] as const;
type TabId = typeof TABS[number]["id"];

export default function AnalyticsView({ forecaster, exporting }: Props) {
  const [tab, setTab] = useState<TabId>("historical");

  return (
    <div className="flex flex-col gap-5 py-2 animate-fade-in">

      {/* ── Tab bar ─────────────────────────────────────────────────────── */}
      <div className="flex gap-1 p-1 rounded-xl w-fit"
        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="px-4 py-1.5 rounded-lg text-[11px] font-mono font-semibold tracking-widest uppercase transition-all duration-200"
              style={{
                background: active ? "rgba(0,210,230,0.12)" : "transparent",
                border:     active ? "1px solid rgba(0,210,230,0.28)" : "1px solid transparent",
                color:      active ? "var(--cyan)" : "var(--muted)",
              }}
            >
              {t.id === "threat" && (
                <span className="mr-1.5 inline-block w-1.5 h-1.5 rounded-full align-middle"
                  style={{ background: "var(--red)", boxShadow: "0 0 5px var(--red)", marginBottom: 1 }} />
              )}
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ── Historical view ─────────────────────────────────────────────── */}
      {tab === "historical" && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            <StatCard label="90-day flares"  value={totalFlares}       sub="B+C+M+X"       color="var(--cyan)"    />
            <StatCard label="X-class events" value={xCount}            sub="last 90 days"  color="var(--red)"     />
            <StatCard label="Peak CME speed" value={`${maxCme} km/s`}  sub="30-day window" color="#fb923c"        />
            <StatCard label="Avg Kp index"   value="4.2"               sub="current period"color="var(--amber)"   />
            <StatCard label="PHO approaches" value="3"                 sub="this quarter"  color="var(--emerald)" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="glass rounded-xl p-4 lg:col-span-2" style={{ minHeight: 260 }}>
              <p className="text-[11px] font-mono tracking-widest uppercase mb-3" style={{ color: "var(--cyan)" }}>
                Flare Frequency · 90 Days
              </p>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={flareFreq} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="day" tick={{ fill: "#64748b", fontSize: 9, fontFamily: "monospace" }} interval={14} />
                  <YAxis tick={{ fill: "#64748b", fontSize: 9, fontFamily: "monospace" }} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 10, fontFamily: "monospace", color: "#94a3b8" }} />
                  <Line type="monotone" dataKey="B" stroke="#475569"       dot={false} strokeWidth={1}   />
                  <Line type="monotone" dataKey="C" stroke="var(--amber)"  dot={false} strokeWidth={1.5} />
                  <Line type="monotone" dataKey="M" stroke="#fb923c"       dot={false} strokeWidth={2}   />
                  <Line type="monotone" dataKey="X" stroke="var(--red)"    dot={false} strokeWidth={2.5} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="glass rounded-xl p-4" style={{ minHeight: 260 }}>
              <p className="text-[11px] font-mono tracking-widest uppercase mb-3" style={{ color: "var(--cyan)" }}>
                Risk Radar · Current vs Avg
              </p>
              <ResponsiveContainer width="100%" height={200}>
                <RadarChart data={riskRadar}>
                  <PolarGrid stroke="rgba(255,255,255,0.07)" />
                  <PolarAngleAxis dataKey="subject" tick={{ fill: "#64748b", fontSize: 9, fontFamily: "monospace" }} />
                  <Radar name="Current"   dataKey="current" stroke="var(--cyan)"  fill="var(--cyan)"  fillOpacity={0.18} strokeWidth={1.5} />
                  <Radar name="90-day avg" dataKey="avg"    stroke="var(--amber)" fill="var(--amber)" fillOpacity={0.10} strokeWidth={1} strokeDasharray="4 3" />
                  <Legend wrapperStyle={{ fontSize: 10, fontFamily: "monospace", color: "#94a3b8" }} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="glass rounded-xl p-4" style={{ minHeight: 220 }}>
            <p className="text-[11px] font-mono tracking-widest uppercase mb-3" style={{ color: "var(--cyan)" }}>
              CME Propagation Speed · 30-Day Window (km/s)
            </p>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={cmeSpeeds} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="day" tick={{ fill: "#64748b", fontSize: 9, fontFamily: "monospace" }} interval={4} />
                <YAxis tick={{ fill: "#64748b", fontSize: 9, fontFamily: "monospace" }} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="speed" fill="var(--cyan)" fillOpacity={0.7} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div>
            <p className="text-[11px] font-mono tracking-widest uppercase mb-3" style={{ color: "var(--muted)" }}>
              Standard Mitigation Protocols
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {MITIGATION_PROTOCOLS.map((p) => (
                <div key={p.id} className="glass rounded-xl p-4" style={{ borderLeft: `3px solid ${p.severity}` }}>
                  <p className="font-mono font-semibold text-xs tracking-wide mb-1" style={{ color: p.severity }}>
                    {p.title}
                  </p>
                  <p className="text-[10px] font-mono mb-2" style={{ color: "var(--muted)" }}>
                    Trigger: {p.trigger}
                  </p>
                  <p className="text-[11px] font-mono leading-relaxed" style={{ color: "var(--foreground)", opacity: 0.85 }}>
                    {p.action}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── Threat Matrix view ──────────────────────────────────────────── */}
      {tab === "threat" && (
        <AdvancedThreatMatrix forecaster={forecaster} exporting={exporting} />
      )}
    </div>
  );
}
