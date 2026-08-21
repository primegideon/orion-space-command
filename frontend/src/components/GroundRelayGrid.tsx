"use client";

import { useEffect, useState } from "react";

/* ── Simulated DSN / ground station grid ──────────────────────────────────*/

type StationStatus = "UPLINK" | "DOWNLINK" | "STANDBY" | "OFFLINE" | "MAINTENANCE";

interface Station {
  id: string;
  name: string;
  location: string;
  lat: number;
  lng: number;
  status: StationStatus;
  elevation: number;    // current target elevation (deg)
  dataRate: number;     // Mbps
  freqBand: string;
  nextContact: string;
  asset: string;
}

const STATIONS: Station[] = [
  { id: "DSN-14",  name: "Goldstone DSS-14", location: "Mojave, CA, USA",   lat: 35.4,  lng: -116.9, status: "UPLINK",      elevation: 42,  dataRate: 4.8,  freqBand: "X-band",  nextContact: "T+00:12:30", asset: "ORION-CORE-1"  },
  { id: "DSN-63",  name: "Madrid DSS-63",    location: "Robledo, Spain",    lat: 40.4,  lng: -4.2,   status: "DOWNLINK",    elevation: 31,  dataRate: 2.1,  freqBand: "Ka-band", nextContact: "T+00:08:15", asset: "GEO-SYNC-4"   },
  { id: "DSN-43",  name: "Canberra DSS-43",  location: "Tidbinbilla, AUS",  lat: -35.4, lng: 148.9,  status: "STANDBY",     elevation: 0,   dataRate: 0.0,  freqBand: "S-band",  nextContact: "T+02:44:00", asset: "RELAY-STAR-9"  },
  { id: "ESA-ESOC",name: "ESA ESOC",         location: "Darmstadt, Germany",lat: 49.8,  lng: 8.6,    status: "UPLINK",      elevation: 58,  dataRate: 6.2,  freqBand: "X-band",  nextContact: "T+00:03:45", asset: "ORION-CORE-2"  },
  { id: "JAXA-UD", name: "JAXA Uchinoura",   location: "Kimotsuki, Japan",  lat: 31.2,  lng: 131.1,  status: "DOWNLINK",    elevation: 22,  dataRate: 1.4,  freqBand: "S-band",  nextContact: "T+00:19:00", asset: "SCOUT-2"      },
  { id: "ISRO-BY", name: "ISRO Bylalu",      location: "Bengaluru, India",  lat: 13.0,  lng: 77.5,   status: "STANDBY",     elevation: 0,   dataRate: 0.0,  freqBand: "S-band",  nextContact: "T+01:02:00", asset: "HALO-ORB-2"   },
  { id: "SSC-SK",  name: "SSC Svalbard",     location: "Longyearbyen, NOR", lat: 78.2,  lng: 15.4,   status: "UPLINK",      elevation: 14,  dataRate: 3.3,  freqBand: "X-band",  nextContact: "T+00:06:20", asset: "ORION-CORE-3"  },
  { id: "KSAT-TR", name: "KSAT Troll",       location: "Antarctica",        lat: -72.0, lng: 2.5,    status: "MAINTENANCE", elevation: 0,   dataRate: 0.0,  freqBand: "X-band",  nextContact: "T+06:00:00", asset: "—"            },
  { id: "CNES-TS", name: "CNES Toulouse",    location: "Toulouse, France",  lat: 43.6,  lng: 1.4,    status: "OFFLINE",     elevation: 0,   dataRate: 0.0,  freqBand: "Ka-band", nextContact: "T+12:00:00", asset: "—"            },
];

const STATUS_COLOR: Record<StationStatus, string> = {
  UPLINK:      "var(--cyan)",
  DOWNLINK:    "var(--emerald)",
  STANDBY:     "var(--amber)",
  OFFLINE:     "var(--red)",
  MAINTENANCE: "#a78bfa",
};

const STATUS_ICON: Record<StationStatus, string> = {
  UPLINK:      "▲",
  DOWNLINK:    "▼",
  STANDBY:     "◉",
  OFFLINE:     "✕",
  MAINTENANCE: "⚙",
};

/* ── Tiny world-map dot grid (SVG) ────────────────────────────────────────*/
function WorldDots({ stations }: { stations: Station[] }) {
  // Map lat/lng to SVG coords (simple equirectangular)
  const W = 360, H = 160;
  function proj(lat: number, lng: number) {
    const x = ((lng + 180) / 360) * W;
    const y = ((90 - lat) / 180) * H;
    return { x, y };
  }

  return (
    <div className="glass rounded-xl p-3 mb-4 overflow-hidden">
      <p className="text-[9px] font-mono tracking-widest uppercase mb-2" style={{ color: "var(--muted)" }}>
        Ground Station Map · Equirectangular Projection
      </p>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
        {/* Subtle grid */}
        {[-60,-30,0,30,60].map((lat) => {
          const y = ((90 - lat) / 180) * H;
          return <line key={lat} x1={0} y1={y} x2={W} y2={y} stroke="rgba(255,255,255,0.04)" strokeWidth={0.5} />;
        })}
        {[-120,-60,0,60,120].map((lng) => {
          const x = ((lng + 180) / 360) * W;
          return <line key={lng} x1={x} y1={0} x2={x} y2={H} stroke="rgba(255,255,255,0.04)" strokeWidth={0.5} />;
        })}

        {/* Station dots */}
        {stations.map((s) => {
          const { x, y } = proj(s.lat, s.lng);
          const col = STATUS_COLOR[s.status];
          const active = s.status === "UPLINK" || s.status === "DOWNLINK";
          return (
            <g key={s.id}>
              {active && (
                <circle cx={x} cy={y} r={6} fill="none" stroke={col} strokeWidth={0.8} opacity={0.3}>
                  <animate attributeName="r" from={4} to={10} dur="2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" from={0.4} to={0} dur="2s" repeatCount="indefinite" />
                </circle>
              )}
              <circle cx={x} cy={y} r={3} fill={col} opacity={0.9} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// Tick uplink data rates slightly every 4s for live feel
function useLiveRates(base: Station[]) {
  const [rates, setRates] = useState(base.map((s) => s.dataRate));
  useEffect(() => {
    const id = setInterval(() => {
      setRates(base.map((s) => {
        if (s.status !== "UPLINK" && s.status !== "DOWNLINK") return 0;
        const jitter = (Math.random() - 0.5) * 0.4;
        return Math.max(0.1, +(s.dataRate + jitter).toFixed(1));
      }));
    }, 4000);
    return () => clearInterval(id);
  }, [base]);
  return rates;
}

export default function GroundRelayGrid() {
  const liveRates = useLiveRates(STATIONS);

  const activeCount  = STATIONS.filter((s) => s.status === "UPLINK" || s.status === "DOWNLINK").length;
  const standbyCount = STATIONS.filter((s) => s.status === "STANDBY").length;
  const offlineCount = STATIONS.filter((s) => s.status === "OFFLINE" || s.status === "MAINTENANCE").length;

  return (
    <div className="flex flex-col gap-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="text-[11px] font-mono font-bold tracking-widest uppercase" style={{ color: "var(--cyan)" }}>
            Ground Relay Grid
          </p>
          <p className="text-[10px] font-mono mt-0.5" style={{ color: "var(--muted)" }}>
            DSN · ESA · JAXA · ISRO · SSC · KSAT uplink status
          </p>
        </div>
        <div className="flex gap-3 text-[10px] font-mono">
          <span style={{ color: "var(--cyan)"    }}>▲▼ {activeCount} Active</span>
          <span style={{ color: "var(--amber)"   }}>◉ {standbyCount} Standby</span>
          <span style={{ color: "var(--red)"     }}>✕ {offlineCount} Down</span>
        </div>
      </div>

      <WorldDots stations={STATIONS} />

      {/* Station table */}
      <div className="glass rounded-xl overflow-hidden">
        <div className="grid font-mono text-[9px] tracking-widest uppercase px-4 py-2"
          style={{
            gridTemplateColumns: "1fr 140px 70px 70px 70px 100px 90px",
            color: "var(--muted)",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}>
          <span>Station</span>
          <span>Location</span>
          <span>Status</span>
          <span>El (°)</span>
          <span>Data Rate</span>
          <span>Band / Asset</span>
          <span>Next Contact</span>
        </div>

        {STATIONS.map((s, i) => (
          <div
            key={s.id}
            className="grid items-center px-4 py-2.5 font-mono text-[10px]"
            style={{
              gridTemplateColumns: "1fr 140px 70px 70px 70px 100px 90px",
              background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)",
              borderBottom: i < STATIONS.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
            }}
          >
            <div className="flex flex-col">
              <span style={{ color: "rgba(255,255,255,0.85)" }}>{s.name}</span>
              <span className="text-[9px]" style={{ color: "var(--muted)" }}>{s.id}</span>
            </div>
            <span style={{ color: "rgba(255,255,255,0.45)" }}>{s.location}</span>
            <span className="font-bold text-[9px]" style={{ color: STATUS_COLOR[s.status] }}>
              {STATUS_ICON[s.status]} {s.status}
            </span>
            <span className="tabular-nums" style={{ color: s.elevation > 0 ? "rgba(255,255,255,0.6)" : "var(--muted)" }}>
              {s.elevation > 0 ? `${s.elevation}°` : "—"}
            </span>
            <span className="tabular-nums"
              style={{ color: liveRates[i] > 0 ? "var(--cyan)" : "var(--muted)", transition: "color 0.5s" }}>
              {liveRates[i] > 0 ? `${liveRates[i].toFixed(1)} Mbps` : "—"}
            </span>
            <div className="flex flex-col">
              <span style={{ color: "rgba(255,255,255,0.5)" }}>{s.freqBand}</span>
              <span className="text-[9px]" style={{ color: "var(--cyan)", opacity: 0.7 }}>{s.asset}</span>
            </div>
            <span className="tabular-nums" style={{ color: "rgba(255,255,255,0.45)" }}>{s.nextContact}</span>
          </div>
        ))}
      </div>

      <p className="text-[9px] font-mono" style={{ color: "var(--muted)" }}>
        Simulated contact schedule · Data rates update live via jitter model · Elevation angles from current TLE epoch
      </p>
    </div>
  );
}
