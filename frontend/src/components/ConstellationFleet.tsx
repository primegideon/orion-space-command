"use client";

/* ── Simulated constellation fleet ────────────────────────────────────────
 * Deterministic mock data — no external fetch required.
 * ──────────────────────────────────────────────────────────────────────── */

type Band   = "LEO" | "MEO" | "GEO" | "HEO";
type Health = "NOMINAL" | "DEGRADED" | "CRITICAL" | "OFFLINE";

interface Satellite {
  id: string;
  name: string;
  band: Band;
  altitude: number;   // km
  inclination: number;// deg
  battery: number;    // %
  solar: number;      // W
  signal: number;     // dBm  (negative)
  uptime: string;
  health: Health;
}

const FLEET: Satellite[] = [
  { id: "OC-1",  name: "ORION-CORE-1",  band: "LEO", altitude: 420,   inclination: 51.6, battery: 94, solar: 312, signal: -82,  uptime: "182d 14h", health: "NOMINAL"  },
  { id: "OC-2",  name: "ORION-CORE-2",  band: "LEO", altitude: 420,   inclination: 51.6, battery: 88, solar: 298, signal: -85,  uptime: "182d 12h", health: "NOMINAL"  },
  { id: "OC-3",  name: "ORION-CORE-3",  band: "LEO", altitude: 550,   inclination: 53.0, battery: 71, solar: 241, signal: -91,  uptime: "97d 03h",  health: "DEGRADED" },
  { id: "RS-9",  name: "RELAY-STAR-9",  band: "MEO", altitude: 20200,  inclination: 55.0, battery: 99, solar: 580, signal: -78,  uptime: "410d 07h", health: "NOMINAL"  },
  { id: "RS-11", name: "RELAY-STAR-11", band: "MEO", altitude: 20200,  inclination: 55.0, battery: 97, solar: 570, signal: -80,  uptime: "310d 21h", health: "NOMINAL"  },
  { id: "GS-4",  name: "GEO-SYNC-4",   band: "GEO", altitude: 35786,  inclination: 0.1,  battery: 100,solar: 890, signal: -70,  uptime: "1203d 09h",health: "NOMINAL"  },
  { id: "GS-7",  name: "GEO-SYNC-7",   band: "GEO", altitude: 35786,  inclination: 0.1,  battery: 43, solar: 104, signal: -103, uptime: "621d 15h", health: "CRITICAL" },
  { id: "HO-2",  name: "HALO-ORB-2",   band: "HEO", altitude: 50000,  inclination: 63.4, battery: 82, solar: 195, signal: -94,  uptime: "55d 02h",  health: "NOMINAL"  },
  { id: "SC-1",  name: "SCOUT-1",      band: "LEO", altitude: 340,   inclination: 97.4, battery: 12, solar: 18,  signal: -118, uptime: "3d 11h",   health: "OFFLINE"  },
  { id: "SC-2",  name: "SCOUT-2",      band: "LEO", altitude: 340,   inclination: 97.4, battery: 78, solar: 210, signal: -88,  uptime: "3d 10h",   health: "NOMINAL"  },
];

const HEALTH_COLOR: Record<Health, string> = {
  NOMINAL:  "var(--emerald)",
  DEGRADED: "var(--amber)",
  CRITICAL: "#fb923c",
  OFFLINE:  "var(--red)",
};

const BAND_COLOR: Record<Band, string> = {
  LEO: "var(--cyan)",
  MEO: "var(--emerald)",
  GEO: "var(--amber)",
  HEO: "#a78bfa",
};

function BarCell({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 rounded-full overflow-hidden" style={{ height: 4, background: "rgba(255,255,255,0.06)" }}>
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-[10px] font-mono tabular-nums" style={{ color, minWidth: 30, textAlign: "right" }}>
        {value}%
      </span>
    </div>
  );
}

export default function ConstellationFleet() {
  return (
    <div className="flex flex-col gap-4 animate-fade-in">

      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-mono font-bold tracking-widest uppercase" style={{ color: "var(--cyan)" }}>
            Constellation Fleet
          </p>
          <p className="text-[10px] font-mono mt-0.5" style={{ color: "var(--muted)" }}>
            {FLEET.length} satellites · LEO / MEO / GEO / HEO orbital bands
          </p>
        </div>
        <div className="flex gap-2">
          {(["LEO","MEO","GEO","HEO"] as Band[]).map((b) => (
            <span key={b} className="text-[9px] font-mono px-2 py-0.5 rounded-full"
              style={{ background: `${BAND_COLOR[b]}18`, border: `1px solid ${BAND_COLOR[b]}44`, color: BAND_COLOR[b] }}>
              {b}
            </span>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="glass rounded-xl overflow-hidden">
        {/* Table header */}
        <div className="grid font-mono text-[9px] tracking-widest uppercase px-4 py-2"
          style={{
            gridTemplateColumns: "1fr 60px 100px 80px 110px 90px 80px 90px",
            color: "var(--muted)",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}>
          <span>Satellite</span>
          <span>Band</span>
          <span>Orbit</span>
          <span>Health</span>
          <span>Battery</span>
          <span>Solar (W)</span>
          <span>Signal</span>
          <span>Uptime</span>
        </div>

        {/* Rows */}
        {FLEET.map((sat, i) => (
          <div
            key={sat.id}
            className="grid items-center px-4 py-2.5 font-mono text-[11px] transition-colors duration-150"
            style={{
              gridTemplateColumns: "1fr 60px 100px 80px 110px 90px 80px 90px",
              background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)",
              borderBottom: i < FLEET.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
            }}
          >
            {/* Name */}
            <div className="flex flex-col">
              <span style={{ color: "var(--foreground)" }}>{sat.name}</span>
              <span className="text-[9px]" style={{ color: "var(--muted)" }}>{sat.id}</span>
            </div>

            {/* Band badge */}
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded w-fit"
              style={{ background: `${BAND_COLOR[sat.band]}18`, color: BAND_COLOR[sat.band] }}>
              {sat.band}
            </span>

            {/* Orbit */}
            <span style={{ color: "rgba(255,255,255,0.55)" }}>
              {sat.altitude.toLocaleString()} km · {sat.inclination}°
            </span>

            {/* Health */}
            <span className="text-[9px] font-bold tracking-widest"
              style={{ color: HEALTH_COLOR[sat.health] }}>
              {sat.health === "OFFLINE" ? "● OFFLINE" :
               sat.health === "CRITICAL" ? "▲ CRITICAL" :
               sat.health === "DEGRADED" ? "◆ DEGRADED" : "✓ NOMINAL"}
            </span>

            {/* Battery bar */}
            <div className="pr-2">
              <BarCell value={sat.battery} max={100}
                color={sat.battery < 20 ? "var(--red)" : sat.battery < 50 ? "var(--amber)" : "var(--emerald)"} />
            </div>

            {/* Solar */}
            <span className="tabular-nums" style={{ color: sat.solar < 50 ? "var(--red)" : "rgba(255,255,255,0.6)" }}>
              {sat.solar} W
            </span>

            {/* Signal */}
            <span className="tabular-nums"
              style={{ color: sat.signal < -110 ? "var(--red)" : sat.signal < -95 ? "var(--amber)" : "rgba(255,255,255,0.6)" }}>
              {sat.signal} dBm
            </span>

            {/* Uptime */}
            <span style={{ color: "rgba(255,255,255,0.45)" }}>{sat.uptime}</span>
          </div>
        ))}
      </div>

      <p className="text-[9px] font-mono" style={{ color: "var(--muted)" }}>
        Simulated telemetry · TLE epoch T+0 · Battery SoC via coulomb counting model · Solar output at current β angle
      </p>
    </div>
  );
}
