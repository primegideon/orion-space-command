"use client";

import { useCallback, useEffect, useState } from "react";
import type { DsnDish, DsnResponse, DsnStation } from "@/app/api/dsn/route";

/* ════════════════════════════════════════════════════════════════════════════
 *  GROUND RELAY GRID — Live NASA Deep Space Network
 *  Data source: https://eyes.nasa.gov/dsn/data/dsn.xml  (~5 s cadence)
 *  Backend:     /api/dsn   (parses XML → JSON, 15 s cache)
 * ══════════════════════════════════════════════════════════════════════════*/

type DishStatus = DsnDish["status"];

const STATUS_COLOR: Record<DishStatus, string> = {
  UPLINK:      "var(--cyan)",
  DOWNLINK:    "var(--emerald)",
  BOTH:        "#a78bfa",
  STANDBY:     "var(--amber)",
  MAINTENANCE: "rgba(255,255,255,0.3)",
};

const STATUS_ICON: Record<DishStatus, string> = {
  UPLINK:      "▲",
  DOWNLINK:    "▼",
  BOTH:        "⇅",
  STANDBY:     "◉",
  MAINTENANCE: "⚙",
};

/* ── Data-rate formatter ──────────────────────────────────────────────────*/
function fmtBps(bps: number): string {
  if (bps <= 0)               return "—";
  if (bps >= 1_000_000)       return `${(bps / 1_000_000).toFixed(2)} Mbps`;
  if (bps >= 1_000)           return `${(bps / 1_000).toFixed(1)} kbps`;
  return `${bps} bps`;
}

/* ── Range formatter ──────────────────────────────────────────────────────*/
function fmtRange(km: number | null): string {
  if (km === null || km <= 0) return "—";
  if (km >= 1_000_000)        return `${(km / 1_000_000).toFixed(2)} Gkm`;
  if (km >= 1_000)            return `${(km / 1_000).toFixed(0)} Mkm`;
  return `${km.toLocaleString()} km`;
}

/* ── RTLT formatter ───────────────────────────────────────────────────────*/
function fmtRtlt(s: number | null): string {
  if (s === null || s < 0) return "—";
  if (s >= 3600) return `${(s / 3600).toFixed(1)} h`;
  if (s >= 60)   return `${Math.round(s / 60)} min`;
  return `${Math.round(s)} s`;
}

/* ══════════════════════════════════════════════════════════════════════════
 *  WORLD MAP  — equirectangular SVG with live pulsing dots
 * ══════════════════════════════════════════════════════════════════════════*/

/** Fixed known locations for each DSN complex */
const COMPLEX_COORDS: Record<string, { lat: number; lng: number }> = {
  gdscc: { lat: 35.43,  lng: -116.89 },
  mdscc: { lat: 40.43,  lng: -4.25   },
  cdscc: { lat: -35.40, lng:  148.98  },
};

interface MapStation {
  id:     string;
  name:   string;
  lat:    number;
  lng:    number;
  active: boolean;
  color:  string;
}

function WorldMap({ stations }: { stations: DsnStation[] }) {
  const W = 360, H = 160;
  function proj(lat: number, lng: number) {
    return {
      x: ((lng + 180) / 360) * W,
      y: ((90 - lat) / 180) * H,
    };
  }

  // Collapse dishes into per-complex status
  const mapStations: MapStation[] = stations.map((st) => {
    const coords  = COMPLEX_COORDS[st.id] ?? { lat: st.lat, lng: st.lng };
    const active  = st.dishes.some((d) => d.isActive);
    const hasUp   = st.dishes.some((d) => d.status === "UPLINK" || d.status === "BOTH");
    const hasDown = st.dishes.some((d) => d.status === "DOWNLINK" || d.status === "BOTH");
    const color   = active
      ? (hasUp && hasDown ? "#a78bfa" : hasUp ? "var(--cyan)" : "var(--emerald)")
      : "var(--amber)";
    return { id: st.id, name: st.name, lat: coords.lat, lng: coords.lng, active, color };
  });

  return (
    <div className="glass rounded-xl p-3 mb-4 overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[9px] font-mono tracking-widest uppercase" style={{ color: "var(--muted)" }}>
          Ground Station Map · Equirectangular Projection · NASA DSN Live
        </p>
        <div className="flex gap-3 text-[8px] font-mono" style={{ color: "var(--muted)" }}>
          <span style={{ color: "var(--cyan)"    }}>▲ Uplink</span>
          <span style={{ color: "var(--emerald)"}}>▼ Downlink</span>
          <span style={{ color: "#a78bfa"        }}>⇅ Both</span>
          <span style={{ color: "var(--amber)"   }}>◉ Standby</span>
        </div>
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
        {/* Grid lines */}
        {[-60, -30, 0, 30, 60].map((lat) => {
          const y = ((90 - lat) / 180) * H;
          return <line key={`lat${lat}`} x1={0} y1={y} x2={W} y2={y} stroke="rgba(255,255,255,0.04)" strokeWidth={0.5} />;
        })}
        {[-120, -60, 0, 60, 120].map((lng) => {
          const x = ((lng + 180) / 360) * W;
          return <line key={`lng${lng}`} x1={x} y1={0} x2={x} y2={H} stroke="rgba(255,255,255,0.04)" strokeWidth={0.5} />;
        })}

        {/* Complex dots */}
        {mapStations.map((s) => {
          const { x, y } = proj(s.lat, s.lng);
          return (
            <g key={s.id}>
              {/* Outer pulse ring — only when actively transmitting/receiving */}
              {s.active && (
                <circle cx={x} cy={y} r={6} fill="none" stroke={s.color} strokeWidth={0.8} opacity={0.25}>
                  <animate attributeName="r"       from="4"   to="12"  dur="2.4s" repeatCount="indefinite" />
                  <animate attributeName="opacity" from="0.4" to="0"   dur="2.4s" repeatCount="indefinite" />
                </circle>
              )}
              {/* Core dot */}
              <circle cx={x} cy={y} r={s.active ? 3.5 : 2.5} fill={s.color} opacity={0.92} />
              {/* Label */}
              <text x={x + 5} y={y + 3} fontSize={6} fontFamily="monospace"
                fill="rgba(255,255,255,0.5)">{s.name}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
 *  SIGNAL PILL — compact inline signal indicator
 * ══════════════════════════════════════════════════════════════════════════*/
function SignalPill({ dir, rate, band, active }: { dir: "↑" | "↓"; rate: number; band: string; active: boolean }) {
  const color = active
    ? (dir === "↑" ? "var(--cyan)" : "var(--emerald)")
    : "rgba(255,255,255,0.2)";
  return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded font-mono text-[8px]"
      style={{ background: `${color}18`, border: `1px solid ${color}44`, color }}>
      {dir} {active ? fmtBps(rate) : "—"} {band && `(${band})`}
    </span>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
 *  DISH CARD — expanded row for one DSN dish
 * ══════════════════════════════════════════════════════════════════════════*/
function DishCard({ dish, index, total }: { dish: DsnDish; index: number; total: number }) {
  const col    = STATUS_COLOR[dish.status];
  const icon   = STATUS_ICON[dish.status];
  const target = dish.targets.find(t => t.name !== "DSN") ?? dish.targets[0];

  // Collect unique active spacecraft names
  const craftNames = Array.from(new Set(
    dish.signals.filter(s => s.active && s.spacecraft).map(s => s.spacecraft)
  ));
  const craftLabel = craftNames.length > 0 ? craftNames.join(", ") : dish.spacecraft !== "—" ? dish.spacecraft : "—";

  // Active up/down signals
  const upSignals   = dish.signals.filter(s => s.direction === "uplink");
  const downSignals = dish.signals.filter(s => s.direction === "downlink");

  return (
    <div className="px-4 py-3 font-mono text-[10px]"
      style={{
        background:   index % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)",
        borderBottom: index < total - 1  ? "1px solid rgba(255,255,255,0.04)" : "none",
        borderLeft:   dish.isActive ? `2px solid ${col}` : "2px solid transparent",
      }}
    >
      {/* Row 1: Dish name, complex, status, spacecraft */}
      <div className="grid items-center gap-x-3"
        style={{ gridTemplateColumns: "120px 90px 80px 1fr 80px 90px" }}>

        {/* Dish name */}
        <div className="flex flex-col">
          <span className="font-bold text-[11px]" style={{ color: "rgba(255,255,255,0.9)" }}>
            {dish.name}
          </span>
          <span className="text-[8px]" style={{ color: "var(--muted)" }}>
            {dish.complexName}
          </span>
        </div>

        {/* Status */}
        <span className="font-bold text-[9px]" style={{ color: col }}>
          {icon} {dish.status}
        </span>

        {/* Elevation / Azimuth */}
        <div className="flex flex-col">
          <span className="tabular-nums" style={{ color: dish.elevation > 0 ? "rgba(255,255,255,0.65)" : "var(--muted)" }}>
            El {dish.elevation > 0 ? `${dish.elevation}°` : "—"}
          </span>
          <span className="text-[8px] tabular-nums" style={{ color: "var(--muted)" }}>
            Az {dish.azimuth}°
          </span>
        </div>

        {/* Spacecraft + signals */}
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="truncate font-bold" style={{ color: dish.isActive ? "var(--cyan)" : "rgba(255,255,255,0.4)" }}>
            {craftLabel}
          </span>
          <div className="flex flex-wrap gap-1">
            {upSignals.map((s, i) => (
              <SignalPill key={`u${i}`} dir="↑" rate={s.dataRate} band={s.band} active={s.active} />
            ))}
            {downSignals.map((s, i) => (
              <SignalPill key={`d${i}`} dir="↓" rate={s.dataRate} band={s.band} active={s.active} />
            ))}
          </div>
        </div>

        {/* Range */}
        <div className="flex flex-col">
          <span className="text-[8px] tracking-wider uppercase" style={{ color: "var(--muted)" }}>Range</span>
          <span className="tabular-nums text-[9px]" style={{ color: "rgba(255,255,255,0.5)" }}>
            {fmtRange(target?.downlegRange ?? null)}
          </span>
        </div>

        {/* RTLT */}
        <div className="flex flex-col">
          <span className="text-[8px] tracking-wider uppercase" style={{ color: "var(--muted)" }}>RTLT</span>
          <span className="tabular-nums text-[9px]" style={{ color: "rgba(255,255,255,0.5)" }}>
            {fmtRtlt(target?.rtlt ?? null)}
          </span>
        </div>
      </div>

      {/* Activity label — only when non-trivial */}
      {dish.activity && (
        <p className="mt-1 text-[8px] truncate" style={{ color: "rgba(255,255,255,0.25)" }}>
          {dish.activity}
        </p>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
 *  SKELETON loader
 * ══════════════════════════════════════════════════════════════════════════*/
function Skeleton() {
  return (
    <div className="flex flex-col gap-4 animate-fade-in">
      <div className="glass rounded-xl p-3" style={{ height: 180 }}>
        <div className="skeleton w-48 h-3 mb-3 rounded" />
        <div className="skeleton w-full rounded" style={{ height: 140 }} />
      </div>
      <div className="glass rounded-xl overflow-hidden">
        {[1,2,3,4,5,6].map(i => (
          <div key={i} className="px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
            <div className="flex gap-4">
              <div className="skeleton w-28 h-4 rounded" />
              <div className="skeleton w-20 h-4 rounded" />
              <div className="skeleton w-40 h-4 rounded" />
              <div className="skeleton flex-1 h-4 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
 *  MAIN COMPONENT
 * ══════════════════════════════════════════════════════════════════════════*/
export default function GroundRelayGrid() {
  const [data,        setData]        = useState<DsnResponse | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [syncedAt,    setSyncedAt]    = useState<string>("");

  /** Core fetch — `bust` adds a cache-busting query param for manual refreshes */
  const fetchDsn = useCallback(async (bust = false) => {
    try {
      const url = bust ? `/api/dsn?t=${Date.now()}` : "/api/dsn";
      const res = await fetch(url, bust ? { cache: "no-store" } : undefined);
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const json = await res.json() as DsnResponse & { error?: string };
      if (json.error) throw new Error(json.error);
      setData(json);
      const d = new Date();
      setSyncedAt(
        [d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()]
          .map(n => String(n).padStart(2, "0")).join(":") + " UTC"
      );
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "DSN feed unavailable");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const handleManualRefresh = useCallback(() => {
    if (refreshing) return;
    setRefreshing(true);
    fetchDsn(true);
  }, [fetchDsn, refreshing]);

  useEffect(() => {
    fetchDsn();
    // Poll every 15 s — matches backend cache window
    const poll = setInterval(() => fetchDsn(), 15_000);
    return () => clearInterval(poll);
  }, [fetchDsn]);

  if (loading) return <Skeleton />;

  if (error) {
    return (
      <div className="glass rounded-xl px-5 py-4 font-mono text-sm animate-fade-in"
        style={{ color: "var(--red)", borderColor: "rgba(248,113,113,0.3)" }}>
        <span className="opacity-60 mr-2">[DSN ERROR]</span>{error}
      </div>
    );
  }

  if (!data) return null;

  const { stations, dishes } = data;

  const activeCount  = dishes.filter(d => d.isActive).length;
  const standbyCount = dishes.filter(d => !d.isActive && d.status === "STANDBY").length;
  const maintCount   = dishes.filter(d => d.status === "MAINTENANCE").length;

  // Total live downlink rate
  const totalDownBps = dishes.reduce((acc, d) => acc + d.maxDownlinkBps, 0);
  const totalUpBps   = dishes.reduce((acc, d) => acc + d.maxUplinkBps, 0);

  // Unique active spacecraft
  const activeCraft = Array.from(new Set(
    dishes
      .filter(d => d.isActive)
      .flatMap(d => d.signals.filter(s => s.active && s.spacecraft).map(s => s.spacecraft))
  ));

  // DSN feed epoch
  const feedEpoch = data.timestamp > 0
    ? new Date(data.timestamp).toISOString().slice(11, 19) + " UTC"
    : syncedAt;

  return (
    <div className="flex flex-col gap-4 animate-fade-in">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        {/* Title — min-w-0 allows it to compress rather than pushing badges off-screen */}
        <div className="flex flex-col min-w-0 flex-1">
          <p className="text-[11px] font-mono font-bold tracking-widest uppercase truncate" style={{ color: "var(--cyan)" }}>
            Ground Relay Grid
          </p>
          <p className="text-[10px] font-mono mt-0.5 truncate" style={{ color: "var(--muted)" }}>
            NASA Deep Space Network · Live XML feed · {stations.map(s => s.name).join(" · ")}
          </p>
        </div>
        {/* Badges — shrink-0 keeps them fully visible at all viewport widths */}
        <div className="flex items-center gap-2 shrink-0">
          {syncedAt && (
            <span className="font-mono text-[8px] tracking-widest px-2 py-0.5 rounded-full whitespace-nowrap"
              style={{ background: "rgba(0,210,230,0.08)", border: "1px solid rgba(0,210,230,0.2)", color: "var(--cyan)" }}>
              LIVE · {syncedAt}
            </span>
          )}
          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={refreshing}
            className="font-mono text-[8px] px-2.5 py-1 rounded-full transition-all duration-200 shrink-0 whitespace-nowrap disabled:opacity-50"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "var(--muted)" }}
            title="Refresh DSN feed now (bypasses cache)"
          >
            {refreshing ? "…" : "↻"} Refresh
          </button>
        </div>
      </div>

      {/* ── Stats row ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: "Active Dishes",   value: activeCount,           color: "var(--cyan)"     },
          { label: "Standby",         value: standbyCount,          color: "var(--amber)"    },
          { label: "Maintenance",     value: maintCount,            color: "rgba(255,255,255,0.4)" },
          { label: "Active Craft",    value: activeCraft.length,    color: "var(--emerald)"  },
        ].map((s) => (
          <div key={s.label} className="glass rounded-xl px-3 py-2 flex items-center gap-3">
            <div className="flex flex-col min-w-0">
              <span className="text-[8px] font-mono tracking-widest uppercase" style={{ color: "var(--muted)" }}>{s.label}</span>
            </div>
            <span className="text-[18px] font-mono font-bold tabular-nums ml-auto" style={{ color: s.color }}>{s.value}</span>
          </div>
        ))}
      </div>

      {/* ── Total data rates ────────────────────────────────────────────── */}
      {(totalDownBps > 0 || totalUpBps > 0) && (
        <div className="flex gap-4 px-4 py-2.5 rounded-xl font-mono text-[10px] flex-wrap"
          style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center gap-2">
            <span style={{ color: "var(--muted)" }}>Total ↓ Downlink:</span>
            <span className="font-bold tabular-nums" style={{ color: "var(--emerald)" }}>{fmtBps(totalDownBps)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span style={{ color: "var(--muted)" }}>Total ↑ Uplink:</span>
            <span className="font-bold tabular-nums" style={{ color: "var(--cyan)" }}>{fmtBps(totalUpBps)}</span>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <span style={{ color: "var(--muted)" }}>Feed epoch:</span>
            <span className="tabular-nums" style={{ color: "rgba(255,255,255,0.4)" }}>{feedEpoch}</span>
          </div>
        </div>
      )}

      {/* ── Active spacecraft ticker ─────────────────────────────────────── */}
      {activeCraft.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[8px] font-mono tracking-widest uppercase shrink-0" style={{ color: "var(--muted)" }}>
            Active spacecraft:
          </span>
          {activeCraft.map(c => (
            <span key={c} className="px-1.5 py-0.5 rounded font-mono text-[9px] font-bold"
              style={{ background: "rgba(0,210,230,0.08)", border: "1px solid rgba(0,210,230,0.2)", color: "var(--cyan)" }}>
              {c}
            </span>
          ))}
        </div>
      )}

      {/* ── World map ───────────────────────────────────────────────────── */}
      <WorldMap stations={stations} />

      {/* ── Per-complex section ─────────────────────────────────────────── */}
      {stations.map((station) => {
        const stActive = station.dishes.filter(d => d.isActive).length;
        return (
          <div key={station.id} className="flex flex-col gap-1">
            {/* Complex header */}
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: stActive > 0 ? "var(--cyan)" : "var(--amber)",
                           boxShadow: stActive > 0 ? "0 0 6px var(--cyan)" : "none" }} />
                <p className="text-[10px] font-mono font-bold tracking-widest uppercase"
                  style={{ color: stActive > 0 ? "var(--cyan)" : "var(--muted)" }}>
                  {station.name} ({station.id.toUpperCase()}) · {station.location}
                </p>
              </div>
              <span className="font-mono text-[9px]" style={{ color: "var(--muted)" }}>
                {stActive} / {station.dishes.length} active
              </span>
            </div>

            {/* Dish table */}
            <div className="glass rounded-xl overflow-hidden">
              {/* Column header */}
              <div className="grid px-4 py-1.5 font-mono text-[8px] tracking-widest uppercase"
                style={{
                  gridTemplateColumns: "120px 90px 80px 1fr 80px 90px",
                  color: "var(--muted)",
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                }}>
                <span>Dish</span>
                <span>Status</span>
                <span>El / Az</span>
                <span>Spacecraft / Signals</span>
                <span>Range</span>
                <span>RTLT</span>
              </div>

              {station.dishes.length === 0 && (
                <p className="px-4 py-3 text-[10px] font-mono" style={{ color: "var(--muted)" }}>
                  No dish data for this complex.
                </p>
              )}

              {station.dishes.map((dish, i) => (
                <DishCard
                  key={dish.name}
                  dish={dish}
                  index={i}
                  total={station.dishes.length}
                />
              ))}
            </div>
          </div>
        );
      })}

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <p className="text-[9px] font-mono" style={{ color: "var(--muted)" }}>
        Source: NASA DSN Now · eyes.nasa.gov/dsn/data/dsn.xml · Feed updates every ~5 s · ORION polls every 15 s ·
        Data rates, signals and spacecraft IDs parsed directly from DONKI XML telemetry
      </p>
    </div>
  );
}
