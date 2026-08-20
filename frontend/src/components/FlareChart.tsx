"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  ScatterChart,
  Scatter,
  ZAxis,
} from "recharts";
import type { FlareItem } from "./ForecasterPanel";

/* ── helpers ─────────────────────────────────────────────────────────────── */
function flareClassToNumber(cls: string): number {
  const letter = (cls ?? "").charAt(0).toUpperCase();
  if (letter === "X") return 4;
  if (letter === "M") return 3;
  if (letter === "C") return 2;
  if (letter === "B") return 1;
  return 0;
}

function flareColor(cls: string): string {
  const letter = (cls ?? "").charAt(0).toUpperCase();
  if (letter === "X") return "#f87171";
  if (letter === "M") return "#fb923c";
  if (letter === "C") return "#fbbf24";
  return "#4a5568";
}

/* ── daily frequency buckets ────────────────────────────────────────────── */
interface DayBucket {
  date: string;
  count: number;
  worstClass: string;
}

function buildDailyBuckets(items: FlareItem[]): DayBucket[] {
  const map = new Map<string, DayBucket>();
  for (const f of items) {
    const date = (f.begin_time ?? "").slice(0, 10);
    if (!date) continue;
    const existing = map.get(date);
    if (!existing) {
      map.set(date, { date, count: 1, worstClass: f.class_type });
    } else {
      existing.count++;
      if (flareClassToNumber(f.class_type) > flareClassToNumber(existing.worstClass)) {
        existing.worstClass = f.class_type;
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/* ── scatter data ────────────────────────────────────────────────────────── */
interface ScatterPoint {
  x: number;    // unix timestamp ms
  y: number;    // class number 0-4
  cls: string;
  label: string;
}

function buildScatterData(items: FlareItem[]): ScatterPoint[] {
  return items
    .filter((f) => f.peak_time)
    .map((f) => ({
      x: new Date(f.peak_time).getTime(),
      y: flareClassToNumber(f.class_type),
      cls: f.class_type,
      label: f.peak_time.slice(0, 16).replace("T", " "),
    }));
}

/* ── custom tooltip ─────────────────────────────────────────────────────── */
function CustomBarTooltip({ active, payload }: { active?: boolean; payload?: {payload: DayBucket}[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg px-3 py-2 text-[11px] font-mono"
      style={{ background: "rgba(8,12,20,0.95)", border: "1px solid var(--border)", color: "#c9d1d9" }}>
      <p>{d.date}</p>
      <p>Flares: <span style={{ color: flareColor(d.worstClass) }}>{d.count}</span></p>
      <p>Peak class: <span style={{ color: flareColor(d.worstClass) }}>{d.worstClass || "—"}</span></p>
    </div>
  );
}

function CustomScatterTooltip({ active, payload }: { active?: boolean; payload?: {payload: ScatterPoint}[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg px-3 py-2 text-[11px] font-mono"
      style={{ background: "rgba(8,12,20,0.95)", border: "1px solid var(--border)", color: "#c9d1d9" }}>
      <p style={{ color: flareColor(d.cls) }}>{d.cls || "?"}</p>
      <p>{d.label}</p>
    </div>
  );
}

/* ── public component ────────────────────────────────────────────────────── */
interface FlareChartProps {
  items: FlareItem[];
}

const CLASS_LABELS = ["A/B", "C", "M", "X"];
const axisStyle = { fill: "#4a5568", fontSize: 10, fontFamily: "var(--font-geist-mono, monospace)" };

export default function FlareChart({ items }: FlareChartProps) {
  const buckets = buildDailyBuckets(items);
  const scatter = buildScatterData(items);

  if (items.length === 0) return null;

  return (
    <div className="flex flex-col gap-3 w-full">
      {/* ── Bar chart: daily frequency ── */}
      <div>
        <p className="label mb-1">Daily Flare Frequency</p>
        <ResponsiveContainer width="100%" height={80}>
          <BarChart data={buckets} margin={{ top: 2, right: 4, bottom: 0, left: -24 }}>
            <XAxis
              dataKey="date"
              tick={axisStyle}
              tickFormatter={(v: string) => v.slice(5)}
              interval="preserveStartEnd"
            />
            <YAxis tick={axisStyle} allowDecimals={false} width={28} />
            <Tooltip content={<CustomBarTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
            <Bar dataKey="count" radius={[2, 2, 0, 0]}>
              {buckets.map((b, i) => (
                <Cell key={i} fill={flareColor(b.worstClass)} opacity={0.8} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ── Scatter: peak intensity timeline ── */}
      <div>
        <p className="label mb-1">Peak Intensity Timeline</p>
        <ResponsiveContainer width="100%" height={80}>
          <ScatterChart margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
            <XAxis
              dataKey="x"
              type="number"
              domain={["auto", "auto"]}
              scale="time"
              tick={axisStyle}
              tickFormatter={(v: number) => new Date(v).toISOString().slice(5, 10)}
              interval="preserveStartEnd"
            />
            <YAxis
              dataKey="y"
              type="number"
              domain={[-0.5, 4.5]}
              ticks={[0, 1, 2, 3, 4]}
              tickFormatter={(v: number) => CLASS_LABELS[v] ?? ""}
              tick={axisStyle}
              width={28}
            />
            <ZAxis range={[28, 28]} />
            <Tooltip content={<CustomScatterTooltip />} cursor={{ strokeDasharray: "3 3", stroke: "var(--border)" }} />
            <Scatter data={scatter}>
              {scatter.map((p, i) => (
                <Cell key={i} fill={flareColor(p.cls)} opacity={0.85} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
