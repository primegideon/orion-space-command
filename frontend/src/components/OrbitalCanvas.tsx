"use client";

import { useEffect, useRef, useState } from "react";
import type { AsteroidItem } from "./SentinelPanel";

/* ── Orbital diagram — pure SVG + rAF animation ──────────────────────────────
 *
 * Satellites are animated by a requestAnimationFrame loop that directly writes
 * SVG transform="rotate(deg, cx, cy)" on each <g> element via refs.
 * This bypasses the broken CSS transform-origin behaviour in SVG entirely.
 * ─────────────────────────────────────────────────────────────────────────── */

interface OrbitalCanvasProps {
  items: AsteroidItem[];
}

/* ── constants ────────────────────────────────────────────────────────────── */
const CX = 150, CY = 150;
const EARTH_R      = 14;
const LEO_R        = 38;
const MEO_R        = 62;
const GEO_R        = 90;
const MAX_ASTEROID_R = 130;

const LEO_SATS = 12;
const MEO_SATS = 8;
const GEO_SATS = 5;

/* Degrees per millisecond for each ring */
const LEO_SPEED = 360 / (6_000);   // 6 s per revolution
const MEO_SPEED = 360 / (11_000);  // 11 s per revolution
const GEO_SPEED = 360 / (18_000);  // 18 s per revolution

/* ── helpers ─────────────────────────────────────────────────────────────── */
function polarToXY(cx: number, cy: number, r: number, angleDeg: number) {
  const a = (angleDeg - 90) * (Math.PI / 180);
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function asteroidSceneR(missKm: number | null): number {
  const km = missKm ?? 384_400;
  const norm = Math.min(km / 384_400, 1);
  return LEO_R + 16 + norm * (MAX_ASTEROID_R - LEO_R - 16);
}

/* ── star field ──────────────────────────────────────────────────────────── */
function buildStars(n: number) {
  const stars: { x: number; y: number; r: number; o: number }[] = [];
  let seed = 42;
  for (let i = 0; i < n; i++) {
    seed = (seed * 1664525 + 1013904223) & 0xffffffff;
    const ux = ((seed >>> 16) & 0xffff) / 65535;
    seed = (seed * 1664525 + 1013904223) & 0xffffffff;
    const uy = ((seed >>> 16) & 0xffff) / 65535;
    seed = (seed * 1664525 + 1013904223) & 0xffffffff;
    const ur = ((seed >>> 16) & 0xffff) / 65535;
    stars.push({ x: ux * 300, y: uy * 300, r: 0.4 + ur * 0.8, o: 0.2 + ur * 0.5 });
  }
  return stars;
}
const STARS = buildStars(80);

/* ── asteroid arc (static SVG) ───────────────────────────────────────────── */
function AsteroidArc({ item, index, total }: { item: AsteroidItem; index: number; total: number }) {
  const angle    = (index / Math.max(total, 1)) * 360;
  const approachR = asteroidSceneR(item.miss_distance_km);
  const approach  = polarToXY(CX, CY, approachR, angle);
  const inbound   = polarToXY(CX, CY, MAX_ASTEROID_R + 15, angle + (index % 2 === 0 ? 18 : -18));
  const mid = {
    x: (approach.x + inbound.x) / 2 + (index % 2 === 0 ? 8 : -8),
    y: (approach.y + inbound.y) / 2 - 10,
  };
  const isPHO = item.is_potentially_hazardous;
  const color = isPHO ? "#f87171" : "#38bdf8";

  return (
    <g>
      <path
        d={`M ${inbound.x} ${inbound.y} Q ${mid.x} ${mid.y} ${approach.x} ${approach.y}`}
        fill="none" stroke={color}
        strokeWidth={isPHO ? 1.2 : 0.7}
        opacity={isPHO ? 0.85 : 0.5}
        strokeLinecap="round"
      />
      <circle cx={approach.x} cy={approach.y} r={isPHO ? 3.5 : 2.5} fill={color} opacity={isPHO ? 0.95 : 0.7}>
        {isPHO && <animate attributeName="opacity" values="0.95;0.3;0.95" dur="1.8s" repeatCount="indefinite" />}
      </circle>
      {isPHO && (
        <text x={approach.x + 5} y={approach.y - 4} fontSize="5" fill="#f87171" fontFamily="monospace" opacity="0.9">
          PHO
        </text>
      )}
    </g>
  );
}

/* ── ring label ──────────────────────────────────────────────────────────── */
function RingLabel({ r, label }: { r: number; label: string }) {
  return (
    <text x={CX + r + 2} y={CY - 2} fontSize="4.5" fill="#4a5568" fontFamily="monospace" opacity="0.8">
      {label}
    </text>
  );
}

/* ── satellite count ticker ──────────────────────────────────────────────── */
function SatCounter({ total }: { total: number }) {
  const [count, setCount] = useState(0);
  const ref = useRef(0);
  useEffect(() => {
    ref.current = 0;
    const step = Math.ceil(total / 40);
    const id = setInterval(() => {
      ref.current = Math.min(ref.current + step, total);
      setCount(ref.current);
      if (ref.current >= total) clearInterval(id);
    }, 30);
    return () => clearInterval(id);
  }, [total]);
  return <>{count}</>;
}

/* ── main component ──────────────────────────────────────────────────────── */
export default function OrbitalCanvas({ items }: OrbitalCanvasProps) {
  const totalSats = LEO_SATS + MEO_SATS + GEO_SATS;

  /* Refs to every satellite <g> element, grouped by ring */
  const leoRefs = useRef<(SVGGElement | null)[]>([]);
  const meoRefs = useRef<(SVGGElement | null)[]>([]);
  const geoRefs = useRef<(SVGGElement | null)[]>([]);

  useEffect(() => {
    let rafId: number;
    let last: number | null = null;

    /* Per-satellite current angle — staggered evenly around the ring at start */
    const leoAngles = Array.from({ length: LEO_SATS }, (_, i) => (i / LEO_SATS) * 360);
    const meoAngles = Array.from({ length: MEO_SATS }, (_, i) => (i / MEO_SATS) * 360);
    const geoAngles = Array.from({ length: GEO_SATS }, (_, i) => (i / GEO_SATS) * 360);

    function tick(now: number) {
      const dt = last === null ? 16 : now - last;
      last = now;

      /* LEO */
      for (let i = 0; i < LEO_SATS; i++) {
        leoAngles[i] = (leoAngles[i] + LEO_SPEED * dt) % 360;
        leoRefs.current[i]?.setAttribute(
          "transform",
          `rotate(${leoAngles[i]}, ${CX}, ${CY})`
        );
      }
      /* MEO */
      for (let i = 0; i < MEO_SATS; i++) {
        meoAngles[i] = (meoAngles[i] + MEO_SPEED * dt) % 360;
        meoRefs.current[i]?.setAttribute(
          "transform",
          `rotate(${meoAngles[i]}, ${CX}, ${CY})`
        );
      }
      /* GEO */
      for (let i = 0; i < GEO_SATS; i++) {
        geoAngles[i] = (geoAngles[i] + GEO_SPEED * dt) % 360;
        geoRefs.current[i]?.setAttribute(
          "transform",
          `rotate(${geoAngles[i]}, ${CX}, ${CY})`
        );
      }

      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <div
      className="w-full rounded-xl overflow-hidden relative select-none"
      style={{ height: 220, minHeight: 220, background: "rgba(4,9,15,0.85)", border: "1px solid var(--border)" }}
    >
      <svg viewBox="0 0 300 300" width="100%" height="100%" style={{ display: "block" }}>

        {/* stars */}
        {STARS.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#fff" opacity={s.o} />
        ))}

        {/* orbit rings */}
        <circle cx={CX} cy={CY} r={GEO_R} fill="none" stroke="#34d399" strokeWidth="0.4" opacity="0.15" strokeDasharray="3 4" />
        <RingLabel r={GEO_R} label="GEO" />
        <circle cx={CX} cy={CY} r={MEO_R} fill="none" stroke="#818cf8" strokeWidth="0.4" opacity="0.18" strokeDasharray="2 3" />
        <RingLabel r={MEO_R} label="MEO" />
        <circle cx={CX} cy={CY} r={LEO_R} fill="none" stroke="#38bdf8" strokeWidth="0.5" opacity="0.22" />
        <RingLabel r={LEO_R} label="LEO" />

        {/* LEO satellites — dot at top of ring, rotated by rAF */}
        {Array.from({ length: LEO_SATS }, (_, i) => (
          <g key={i} ref={el => { leoRefs.current[i] = el; }}>
            <circle cx={CX} cy={CY - LEO_R} r={2.4} fill="#38bdf8" opacity={0.9} />
            {/* subtle glow ring */}
            <circle cx={CX} cy={CY - LEO_R} r={3.8} fill="none" stroke="#38bdf8" strokeWidth="0.6" opacity={0.3} />
          </g>
        ))}

        {/* MEO satellites */}
        {Array.from({ length: MEO_SATS }, (_, i) => (
          <g key={i} ref={el => { meoRefs.current[i] = el; }}>
            <circle cx={CX} cy={CY - MEO_R} r={2.2} fill="#818cf8" opacity={0.75} />
            <circle cx={CX} cy={CY - MEO_R} r={3.4} fill="none" stroke="#818cf8" strokeWidth="0.5" opacity={0.25} />
          </g>
        ))}

        {/* GEO satellites */}
        {Array.from({ length: GEO_SATS }, (_, i) => (
          <g key={i} ref={el => { geoRefs.current[i] = el; }}>
            <circle cx={CX} cy={CY - GEO_R} r={2.0} fill="#34d399" opacity={0.65} />
            <circle cx={CX} cy={CY - GEO_R} r={3.2} fill="none" stroke="#34d399" strokeWidth="0.5" opacity={0.2} />
          </g>
        ))}

        {/* asteroid arcs */}
        {items.slice(0, 20).map((item, i) => (
          <AsteroidArc key={i} item={item} index={i} total={Math.min(items.length, 20)} />
        ))}

        {/* Earth glow */}
        <circle cx={CX} cy={CY} r={EARTH_R * 2} fill="#0284c7" opacity="0.07">
          <animate attributeName="r" values={`${EARTH_R * 1.8};${EARTH_R * 2.5};${EARTH_R * 1.8}`} dur="3.5s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.07;0.02;0.07" dur="3.5s" repeatCount="indefinite" />
        </circle>

        {/* Earth */}
        <defs>
          <radialGradient id="earthGrad" cx="40%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#2196a8" />
            <stop offset="100%" stopColor="#0a2a44" />
          </radialGradient>
        </defs>
        <circle cx={CX} cy={CY} r={EARTH_R} fill="url(#earthGrad)" />
        <circle cx={CX - 4} cy={CY - 3} r={4}   fill="#1a6fa8" opacity="0.5" />
        <circle cx={CX + 5} cy={CY + 2} r={3}   fill="#1a6fa8" opacity="0.4" />
        <circle cx={CX} cy={CY} r={EARTH_R + 2} fill="none" stroke="#38bdf8" strokeWidth="1.5" opacity="0.12" />

      </svg>

      {/* HUD — sat count */}
      <div className="absolute top-2 left-3 font-mono text-[9px] tracking-wide" style={{ color: "#38bdf8", opacity: 0.75 }}>
        <span className="opacity-60">SAT </span>
        <SatCounter total={totalSats} />
        <span className="opacity-40"> tracked</span>
      </div>

      {/* HUD — legend */}
      <div className="absolute bottom-2 right-3 flex flex-col gap-0.5">
        {([["#38bdf8","LEO"],["#818cf8","MEO"],["#34d399","GEO"]] as [string,string][]).map(([color, label]) => (
          <div key={label} className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
            <span className="font-mono text-[8px]" style={{ color: "rgba(255,255,255,0.35)" }}>{label}</span>
          </div>
        ))}
      </div>

      {/* PHO alert */}
      {items.some(a => a.is_potentially_hazardous) && (
        <div
          className="absolute top-2 right-3 font-mono text-[8px] tracking-widest uppercase px-1.5 py-0.5 rounded"
          style={{ background: "rgba(248,113,113,0.15)", color: "#f87171", border: "1px solid rgba(248,113,113,0.3)" }}
        >
          PHO DETECTED
        </div>
      )}
    </div>
  );
}
