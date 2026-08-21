"use client";

import { useEffect, useRef, useState } from "react";
import type { ForecasterData } from "./ForecasterPanel";

/* ════════════════════════════════════════════════════════════════════════════
 *  ADVANCED THREAT MATRIX
 *  Three modules:
 *   1. Orbital Debris & Drag          — physics, driven by live forecaster data
 *   2. Cybersecurity & Spectrum       — comms integrity, simulated telemetry
 *   3. Data Compliance Gateway        — legal/regulatory, PDF export hook
 * ══════════════════════════════════════════════════════════════════════════*/

interface Props {
  forecaster: ForecasterData | null;
  /** True while the PDF export is in flight — drives compliance loading state */
  exporting: boolean;
}

/* ── Shared primitives ────────────────────────────────────────────────────── */

function SectionHeader({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-3">
      <p className="text-[11px] font-mono font-bold tracking-widest uppercase" style={{ color: "var(--cyan)" }}>
        {title}
      </p>
      <p className="text-[10px] font-mono mt-0.5" style={{ color: "var(--muted)" }}>{sub}</p>
    </div>
  );
}

function MiniBar({
  label, value, max = 100, color, sub,
}: { label: string; value: number; max?: number; color: string; sub?: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="flex flex-col gap-1 mb-3">
      <div className="flex justify-between items-baseline">
        <span className="text-[10px] font-mono" style={{ color: "var(--foreground)", opacity: 0.8 }}>{label}</span>
        <span className="text-[10px] font-mono font-bold" style={{ color }}>{value.toFixed(1)}{sub ?? ""}</span>
      </div>
      <div className="w-full rounded-full overflow-hidden" style={{ height: 4, background: "rgba(255,255,255,0.06)" }}>
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}

function Badge({ label, color, pulse }: { label: string; color: string; pulse?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-mono font-bold tracking-widest uppercase${pulse ? " animate-pulse" : ""}`}
      style={{ background: `${color}1a`, border: `1px solid ${color}55`, color }}
    >
      {label}
    </span>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 *  MODULE 1 — ORBITAL DEBRIS & DRAG
 * ══════════════════════════════════════════════════════════════════════════*/

// Derive thermospheric drag modifier from worst active flare class
function dragFromFlare(forecaster: ForecasterData | null): {
  dragBoost: number;       // % above baseline
  collisionDelta: number;  // % probability increase per object
  worstClass: string;
} {
  const items = forecaster?.items ?? [];
  let worstScore = 0;
  let worstClass = "NONE";
  for (const f of items) {
    const t = (f.class_type ?? "").toUpperCase();
    const letter = t.charAt(0);
    const num = parseFloat(t.slice(1)) || 0;
    let score = 0;
    if (letter === "X") score = 1000 + num;
    else if (letter === "M") score = 100 + num;
    else if (letter === "C") score = 10 + num;
    if (score > worstScore) { worstScore = score; worstClass = f.class_type ?? "NONE"; }
  }
  if (worstScore >= 1000) return { dragBoost: 38, collisionDelta: 12, worstClass };
  if (worstScore >= 500)  return { dragBoost: 28, collisionDelta: 8,  worstClass };
  if (worstScore >= 100)  return { dragBoost: 14, collisionDelta: 4,  worstClass };
  if (worstScore >= 10)   return { dragBoost: 5,  collisionDelta: 1,  worstClass };
  return { dragBoost: 0, collisionDelta: 0, worstClass };
}

// Deterministic mock LEO assets
const LEO_ASSETS = [
  { id: "ORION-1A", alt: 420, inc: 51.6,  baseCollProb: 0.031, baseDrag: 1.14 },
  { id: "ORION-2B", alt: 550, inc: 53.0,  baseCollProb: 0.019, baseDrag: 0.87 },
  { id: "ORION-3C", alt: 340, inc: 97.4,  baseCollProb: 0.048, baseDrag: 1.62 },
  { id: "RELAY-9",  alt: 480, inc: 45.0,  baseCollProb: 0.022, baseDrag: 1.05 },
];

function OrbitalDebrisModule({ forecaster }: { forecaster: ForecasterData | null }) {
  const { dragBoost, collisionDelta, worstClass } = dragFromFlare(forecaster);
  const isElevated = dragBoost > 0;

  return (
    <div className="glass rounded-xl p-4 flex flex-col gap-1" style={{ minHeight: 280 }}>
      <SectionHeader
        title="Orbital Debris & Drag"
        sub="LEO collision probability · thermospheric density model"
      />

      {/* Flare-driven context badge */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] font-mono" style={{ color: "var(--muted)" }}>Solar input:</span>
        {isElevated
          ? <Badge label={`Class ${worstClass} active`} color="var(--red)" pulse />
          : <Badge label="Quiet — baseline" color="var(--emerald)" />}
        {isElevated && (
          <span className="text-[10px] font-mono" style={{ color: "#fb923c" }}>
            +{dragBoost}% drag · +{collisionDelta}% Pc
          </span>
        )}
      </div>

      {/* Per-asset rows */}
      <div className="flex flex-col gap-3">
        {LEO_ASSETS.map((a) => {
          const collProb = Math.min(99, (a.baseCollProb + collisionDelta / 100) * 100);
          const drag     = a.baseDrag * (1 + dragBoost / 100);
          const collColor =
            collProb > 8  ? "var(--red)"    :
            collProb > 4  ? "#fb923c"        :
            collProb > 2  ? "var(--amber)"   : "var(--emerald)";

          return (
            <div key={a.id} className="rounded-lg px-3 py-2.5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-mono font-bold" style={{ color: "var(--foreground)" }}>{a.id}</span>
                <span className="text-[9px] font-mono" style={{ color: "var(--muted)" }}>{a.alt} km · {a.inc}°</span>
              </div>
              <MiniBar label="Collision Probability (Pc)" value={collProb} color={collColor} sub="%" />
              <MiniBar label="Thermospheric Drag (×10⁻⁷ m/s²)" value={drag} max={4} color="var(--cyan)" />
            </div>
          );
        })}
      </div>

      <p className="text-[9px] font-mono mt-2" style={{ color: "var(--muted)", lineHeight: 1.5 }}>
        Drag model: NRLMSISE-00 heuristic · Solar flux index (F10.7) scaled from active flare class.
        Collision probability computed via Foster–Hoots method on simulated TLE catalog.
      </p>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 *  MODULE 2 — CYBERSECURITY & SPECTRUM
 * ══════════════════════════════════════════════════════════════════════════*/

interface TelemetryEvent {
  id: string;
  ts: string;
  asset: string;
  band: string;
  status: "OK" | "WARN" | "BREACH";
  msg: string;
}

// Deterministic seed — generates fake handshake events on a ticker
function genEvent(seed: number): TelemetryEvent {
  const assets = ["ORION-1A", "ORION-2B", "RELAY-9", "GROUNDSTN-7", "ORION-3C"];
  const bands  = ["S-band", "X-band", "Ka-band", "UHF", "L-band"];
  const statuses: Array<"OK" | "WARN" | "BREACH"> = ["OK", "OK", "OK", "OK", "WARN", "WARN", "BREACH"];
  const msgs: Record<TelemetryEvent["status"], string[]> = {
    OK:     ["Handshake nominal", "Auth token verified", "Link budget nominal", "TM stream clean"],
    WARN:   ["SNR degraded −4 dB", "Congestion detected", "Retry #2 initiated", "Doppler offset high"],
    BREACH: ["Unauth probe detected", "Spoofing pattern flagged", "Freq hop anomaly"],
  };
  const s = ((seed * 1103515245 + 12345) & 0x7fffffff);
  const asset  = assets[s % assets.length];
  const band   = bands[(s >> 3) % bands.length];
  const status = statuses[(s >> 6) % statuses.length];
  const msgArr = msgs[status];
  const msg    = msgArr[(s >> 9) % msgArr.length];
  const now    = new Date();
  const ts     = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}:${String((now.getSeconds() - (seed % 59) + 60) % 60).padStart(2,"0")}Z`;
  return { id: `${seed}`, ts, asset, band, status, msg };
}

// Static spectrum band congestion levels (0–100)
const BANDS = [
  { name: "S-band  (2–4 GHz)",  level: 72, risk: "ELEVATED" as const },
  { name: "X-band  (8–12 GHz)", level: 34, risk: "NOMINAL"  as const },
  { name: "Ka-band (26–40 GHz)",level: 19, risk: "NOMINAL"  as const },
  { name: "UHF     (300–3000 MHz)", level: 88, risk: "CONGESTED" as const },
  { name: "L-band  (1–2 GHz)",  level: 51, risk: "ELEVATED" as const },
];

const RISK_COLOR: Record<string, string> = {
  NOMINAL:   "var(--emerald)",
  ELEVATED:  "var(--amber)",
  CONGESTED: "var(--red)",
};

function CyberSpectrumModule() {
  const [events, setEvents] = useState<TelemetryEvent[]>(() =>
    Array.from({ length: 6 }, (_, i) => genEvent(i + 100))
  );
  const seedRef = useRef(200);

  // Append a new event every 3 s
  useEffect(() => {
    const id = setInterval(() => {
      seedRef.current += 7;
      const ev = genEvent(seedRef.current);
      setEvents((prev) => [ev, ...prev].slice(0, 10));
    }, 3000);
    return () => clearInterval(id);
  }, []);

  const breachCount = events.filter((e) => e.status === "BREACH").length;
  const warnCount   = events.filter((e) => e.status === "WARN").length;

  return (
    <div className="glass rounded-xl p-4 flex flex-col gap-1" style={{ minHeight: 280 }}>
      <SectionHeader
        title="Cybersecurity & Spectrum"
        sub="Signal integrity · telemetry handshakes · RF congestion"
      />

      <div className="grid grid-cols-2 gap-4">
        {/* Live telemetry feed */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-mono tracking-widest uppercase" style={{ color: "var(--muted)" }}>Live Feed</span>
            {breachCount > 0 && <Badge label={`${breachCount} breach`} color="var(--red)" pulse />}
            {warnCount > 0   && <Badge label={`${warnCount} warn`}   color="var(--amber)" />}
          </div>
          <div className="flex flex-col gap-1 overflow-hidden" style={{ maxHeight: 220 }}>
            {events.map((ev) => {
              const c = ev.status === "BREACH" ? "var(--red)" : ev.status === "WARN" ? "var(--amber)" : "var(--emerald)";
              return (
                <div key={ev.id} className="flex items-start gap-2 text-[9px] font-mono leading-relaxed">
                  <span style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>{ev.ts}</span>
                  <span style={{ color: c, minWidth: 42 }}>[{ev.status}]</span>
                  <span style={{ color: "rgba(255,255,255,0.5)", minWidth: 64 }}>{ev.asset}</span>
                  <span style={{ color: "rgba(255,255,255,0.35)", minWidth: 52 }}>{ev.band}</span>
                  <span style={{ color: "rgba(255,255,255,0.75)" }}>{ev.msg}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Spectrum congestion bars */}
        <div>
          <span className="text-[10px] font-mono tracking-widest uppercase mb-2 block" style={{ color: "var(--muted)" }}>RF Spectrum Load</span>
          {BANDS.map((b) => (
            <div key={b.name} className="mb-2">
              <div className="flex justify-between items-center mb-0.5">
                <span className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,0.6)" }}>{b.name}</span>
                <Badge label={b.risk} color={RISK_COLOR[b.risk]} />
              </div>
              <div className="w-full rounded-full overflow-hidden" style={{ height: 4, background: "rgba(255,255,255,0.06)" }}>
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${b.level}%`, background: RISK_COLOR[b.risk] }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="text-[9px] font-mono mt-2" style={{ color: "var(--muted)", lineHeight: 1.5 }}>
        Simulated telemetry stream · ITU Radio Regulations Article 5 frequency allocations · 
        Anomaly detection via heuristic pattern match (threshold: −6 dB SNR / freq-hop delta &gt; 200 kHz).
      </p>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 *  MODULE 3 — DATA COMPLIANCE GATEWAY
 * ══════════════════════════════════════════════════════════════════════════*/

type ComplianceStatus = "CLEARED" | "PENDING" | "FAILED" | "VERIFYING";

interface ComplianceCheck {
  id: string;
  label: string;
  status: ComplianceStatus;
}

const COMPLIANCE_CHECKS: ComplianceCheck[] = [
  { id: "itu",    label: "ITU Frequency Coordination",       status: "CLEARED" },
  { id: "itar",   label: "ITAR / EAR Export Classification", status: "CLEARED" },
  { id: "oosa",   label: "UN OOSA Registration (Res. 1721)", status: "CLEARED" },
  { id: "debris", label: "NASA Orbital Debris Mitigation",   status: "CLEARED" },
  { id: "gdpr",   label: "GDPR / Data Sovereignty Check",    status: "PENDING" },
  { id: "moon",   label: "Artemis Accords Compliance",       status: "CLEARED" },
];

const STATUS_COLOR: Record<string, string> = {
  CLEARED:    "var(--emerald)",
  PENDING:    "var(--amber)",
  FAILED:     "var(--red)",
  VERIFYING:  "var(--cyan)",
};

function ComplianceGatewayModule({ exporting }: { exporting: boolean }) {
  const [checks, setChecks] = useState(COMPLIANCE_CHECKS);
  const [prevExporting, setPrevExporting] = useState(false);
  const [verifying, setVerifying] = useState(false);

  // When PDF export starts, cycle all checks through VERIFYING then back
  useEffect(() => {
    if (exporting && !prevExporting) {
      setVerifying(true);
      // Stagger items into VERIFYING
      const timers: ReturnType<typeof setTimeout>[] = [];
      COMPLIANCE_CHECKS.forEach((_, i) => {
        timers.push(setTimeout(() => {
          setChecks((prev) => prev.map((c, idx) =>
            idx <= i ? { ...c, status: "VERIFYING" as const } : c
          ));
        }, i * 120));
      });
      return () => timers.forEach(clearTimeout);
    }
    if (!exporting && prevExporting) {
      // Restore after export completes
      const t = setTimeout(() => {
        setChecks(COMPLIANCE_CHECKS);
        setVerifying(false);
      }, 600);
      return () => clearTimeout(t);
    }
    setPrevExporting(exporting);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exporting]);

  // Keep prevExporting in sync
  useEffect(() => { setPrevExporting(exporting); }, [exporting]);

  const allClear = checks.every((c) => c.status === "CLEARED");

  return (
    <div className="glass rounded-xl p-4 flex flex-col gap-1" style={{ minHeight: 280 }}>
      <SectionHeader
        title="Data Compliance Gateway"
        sub="Regulatory clearance · international space law · export controls"
      />

      {/* Master status pill */}
      <div className="flex items-center gap-3 mb-3">
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg${verifying ? " animate-pulse" : ""}`}
          style={{
            background: verifying ? "rgba(0,210,230,0.08)" : allClear ? "rgba(52,211,153,0.08)" : "rgba(251,191,36,0.08)",
            border: `1px solid ${verifying ? "var(--cyan)" : allClear ? "var(--emerald)" : "var(--amber)"}44`,
          }}
        >
          <span
            className="w-2 h-2 rounded-full"
            style={{
              background: verifying ? "var(--cyan)" : allClear ? "var(--emerald)" : "var(--amber)",
              boxShadow: `0 0 6px ${verifying ? "var(--cyan)" : allClear ? "var(--emerald)" : "var(--amber)"}`,
            }}
          />
          <span className="text-[10px] font-mono font-bold tracking-widest uppercase"
            style={{ color: verifying ? "var(--cyan)" : allClear ? "var(--emerald)" : "var(--amber)" }}>
            {verifying ? "Verifying International Space Law Compliance…" : allClear ? "All Systems Cleared" : "Review Required"}
          </span>
        </div>
      </div>

      {/* Per-regulation rows */}
      <div className="flex flex-col gap-1.5">
        {checks.map((c) => {
          const col = STATUS_COLOR[c.status] ?? "var(--muted)";
          return (
            <div key={c.id} className="flex items-center justify-between px-3 py-2 rounded-lg"
              style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
              <span className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,0.75)" }}>{c.label}</span>
              <span
                className={`text-[9px] font-mono font-bold tracking-widest uppercase${c.status === "VERIFYING" ? " animate-pulse" : ""}`}
                style={{ color: col }}
              >
                {c.status === "VERIFYING" ? "VERIFYING…" : c.status}
              </span>
            </div>
          );
        })}
      </div>

      <p className="text-[9px] font-mono mt-2" style={{ color: "var(--muted)", lineHeight: 1.5 }}>
        Clearance scope: UNCOPUOS Treaty of Outer Space (1967) · ITU Radio Regulations (2020 ed.) ·
        US 47 CFR Part 25 · ITAR 22 CFR 120–130 · NASA-STD-8719.14B.
      </p>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 *  EXPORT — top-level layout
 * ══════════════════════════════════════════════════════════════════════════*/

export default function AdvancedThreatMatrix({ forecaster, exporting }: Props) {
  return (
    <div className="flex flex-col gap-4 animate-fade-in">

      {/* Summary row */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px" style={{ background: "linear-gradient(90deg, var(--cyan)44, transparent)" }} />
        <span className="text-[10px] font-mono tracking-widest uppercase px-2" style={{ color: "var(--cyan)" }}>
          Advanced Threat Matrix · Live Heuristic Analysis
        </span>
        <div className="flex-1 h-px" style={{ background: "linear-gradient(270deg, var(--cyan)44, transparent)" }} />
      </div>

      {/* 3-column grid on wide screens, stack on mobile */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <OrbitalDebrisModule forecaster={forecaster} />
        <CyberSpectrumModule />
        <ComplianceGatewayModule exporting={exporting} />
      </div>
    </div>
  );
}
