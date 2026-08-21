"use client";

import type { FlareItem } from "./ForecasterPanel";

/* ── NOAA Space Weather Scale heuristics ─────────────────────────────────────
 *
 * Reference: https://www.swpc.noaa.gov/noaa-scales-explanation
 *
 * We derive three risk scores from the worst flare class observed in the
 * current DONKI period:
 *
 *  - Satellite Comms Degradation  (driven by Radio Blackout scale — R-scale)
 *  - Power Grid Anomaly Risk      (driven by Geomagnetic Storm scale — G-scale)
 *  - Radiation Storm Risk         (driven by Solar Radiation Storm — S-scale)
 *
 * Mapping (worst observed class → base probability %):
 *   A/B  → 5 / 2 / 1
 *   C    → 15 / 8 / 5
 *   M1-4 → 35 / 22 / 18
 *   M5+  → 55 / 38 / 30
 *   X1-4 → 75 / 60 / 52
 *   X5+  → 92 / 85 / 78
 * ─────────────────────────────────────────────────────────────────────────── */

interface RiskScores {
  satComms: number;      // satellite communication degradation %
  powerGrid: number;     // power grid anomaly risk %
  radiation: number;     // radiation storm risk %
  worstClass: string;
  scale: string;         // human-readable NOAA scale label
}

function classToNumber(cls: string): number {
  const letter = (cls ?? "").charAt(0).toUpperCase();
  const num = parseFloat((cls ?? "").slice(1)) || 0;
  if (letter === "X") return 50 + Math.min(num, 10);
  if (letter === "M") return 30 + Math.min(num, 9.9);
  if (letter === "C") return 20 + Math.min(num, 9.9);
  if (letter === "B") return 10;
  return 5; // A or unknown
}

function computeRisk(items: FlareItem[]): RiskScores {
  if (!items.length) {
    return { satComms: 3, powerGrid: 1, radiation: 1, worstClass: "None", scale: "Quiet" };
  }

  // Find worst class
  let worstClass = "A";
  let worstNum = 0;
  for (const f of items) {
    const n = classToNumber(f.class_type);
    if (n > worstNum) { worstNum = n; worstClass = f.class_type; }
  }

  const letter = worstClass.charAt(0).toUpperCase();
  const magnitude = parseFloat(worstClass.slice(1)) || 0;

  // count X-class and M-class events for frequency multiplier
  const xCount = items.filter(f => f.class_type?.charAt(0).toUpperCase() === "X").length;
  const mCount = items.filter(f => f.class_type?.charAt(0).toUpperCase() === "M").length;
  const freqBoost = Math.min(0.12, (xCount * 0.05 + mCount * 0.01));

  let satComms: number, powerGrid: number, radiation: number, scale: string;

  if (letter === "X" && magnitude >= 5) {
    satComms = 92; powerGrid = 85; radiation = 78; scale = "R5 / G4-5 / S4";
  } else if (letter === "X") {
    satComms = 75; powerGrid = 60; radiation = 52; scale = "R3-4 / G3 / S3";
  } else if (letter === "M" && magnitude >= 5) {
    satComms = 55; powerGrid = 38; radiation = 30; scale = "R2 / G2 / S2";
  } else if (letter === "M") {
    satComms = 35; powerGrid = 22; radiation = 18; scale = "R1-2 / G1 / S1";
  } else if (letter === "C") {
    satComms = 15; powerGrid = 8;  radiation = 5;  scale = "R0-1 / G0 / S0";
  } else {
    satComms = 5;  powerGrid = 2;  radiation = 1;  scale = "Quiet";
  }

  // Apply frequency boost (capped at 100)
  satComms  = Math.min(100, Math.round((satComms  + freqBoost * 100)));
  powerGrid = Math.min(100, Math.round((powerGrid + freqBoost * 100)));
  radiation = Math.min(100, Math.round((radiation + freqBoost * 100)));

  return { satComms, powerGrid, radiation, worstClass, scale };
}

/* ── Risk colour helper ──────────────────────────────────────────────────── */
function riskColor(pct: number): string {
  if (pct >= 70) return "#f87171"; // red
  if (pct >= 40) return "#fb923c"; // orange
  if (pct >= 20) return "#fbbf24"; // amber
  return "#34d399";                // emerald — low risk
}

function riskLabel(pct: number): string {
  if (pct >= 70) return "HIGH";
  if (pct >= 40) return "ELEVATED";
  if (pct >= 20) return "MODERATE";
  return "LOW";
}

/* ── Progress bar row ────────────────────────────────────────────────────── */
interface BarRowProps {
  label: string;
  sublabel: string;
  pct: number;
}

function BarRow({ label, sublabel, pct }: BarRowProps) {
  const color = riskColor(pct);
  const lvl = riskLabel(pct);

  return (
    <div className="flex flex-col gap-2">
      {/* Label row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-[12px] font-mono text-white/80 whitespace-nowrap">{label}</span>
          <span className="text-[10px] font-mono whitespace-nowrap" style={{ color: "var(--muted)" }}>
            {sublabel}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded whitespace-nowrap"
            style={{ background: `${color}22`, color, border: `1px solid ${color}44` }}
          >
            {lvl}
          </span>
          <span className="text-[13px] font-mono font-bold w-9 text-right" style={{ color }}>
            {pct}%
          </span>
        </div>
      </div>

      {/* Track */}
      <div
        className="w-full rounded-full overflow-hidden"
        style={{ height: 6, background: "rgba(255,255,255,0.06)" }}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${color}99, ${color})`,
            transition: "width 0.9s cubic-bezier(0.4,0,0.2,1)",
            boxShadow: `0 0 8px ${color}55`,
          }}
        />
      </div>
    </div>
  );
}

/* ── Public component ────────────────────────────────────────────────────── */
interface RiskMatrixProps {
  items: FlareItem[];
}

export default function RiskMatrix({ items }: RiskMatrixProps) {
  const risk = computeRisk(items);

  return (
    <div className="flex flex-col gap-4 animate-fade-in">

      {/* Header row — worst observed class + NOAA scale */}
      <div
        className="flex items-center justify-between rounded-xl px-3 py-2.5"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
      >
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-mono tracking-widest uppercase" style={{ color: "var(--muted)" }}>
            Worst observed
          </span>
          <span className="text-[14px] font-mono font-bold" style={{ color: riskColor(risk.satComms) }}>
            {risk.worstClass === "None" ? "No events" : `Class ${risk.worstClass}`}
          </span>
        </div>
        <div className="flex flex-col gap-0.5 text-right">
          <span className="text-[10px] font-mono tracking-widest uppercase" style={{ color: "var(--muted)" }}>
            NOAA Scale
          </span>
          <span className="text-[11px] font-mono font-semibold text-white/70">
            {risk.scale}
          </span>
        </div>
      </div>

      {/* Three risk bars */}
      <div className="flex flex-col gap-4">
        <BarRow
          label="Satellite Comms"
          sublabel="Radio Blackout (R-scale)"
          pct={risk.satComms}
        />
        <BarRow
          label="Power Grid"
          sublabel="Geomagnetic Storm (G-scale)"
          pct={risk.powerGrid}
        />
        <BarRow
          label="Radiation Storm"
          sublabel="Solar Rad. Storm (S-scale)"
          pct={risk.radiation}
        />
      </div>

      {/* Footnote */}
      <p className="text-[10px] font-mono leading-relaxed" style={{ color: "var(--muted)" }}>
        Heuristic model based on NOAA Space Weather Scales.
        Probabilities derived from worst flare class + 30-day event frequency.
      </p>
    </div>
  );
}
