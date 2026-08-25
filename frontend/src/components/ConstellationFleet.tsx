"use client";

import { useEffect, useState } from "react";
import type { SatellitesResponse, SatelliteRecord } from "@/app/api/satellites/route";
import type { TleResponse, TleRecord } from "@/app/api/tle/route";

const BAND_COLOR: Record<SatelliteRecord["band"], string> = {
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
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-[10px] font-mono tabular-nums shrink-0" style={{ color, minWidth: 36, textAlign: "right" }}>
        {value.toFixed(0)} km
      </span>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="grid items-center px-4 py-2.5"
      style={{ gridTemplateColumns: "1fr 60px 110px 80px 80px", gap: 0 }}>
      {[140, 40, 80, 60, 70].map((w, i) => (
        <div key={i} className="animate-pulse rounded" style={{ height: 8, width: w, background: "rgba(255,255,255,0.06)", margin: "0 4px" }} />
      ))}
    </div>
  );
}

export default function ConstellationFleet() {
  const [data, setData]       = useState<SatellitesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string>("");

  // SGP4 live propagation data keyed by NORAD ID
  const [tleMap, setTleMap] = useState<Map<number, TleRecord>>(new Map());
  const [tleLoading, setTleLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/satellites");
        if (!res.ok) throw new Error(`API error ${res.status}`);
        const json = (await res.json()) as SatellitesResponse;
        if (!alive) return;
        if (json.satellites?.length) {
          setData(json);
          setFetchedAt(new Date().toLocaleTimeString("en-US", { hour12: false, timeZone: "UTC" }) + " UTC");
        } else {
          setError("No satellite data returned from CelesTrak.");
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Fetch failed");
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    // Refresh every 60 min — TLEs don't change faster
    const id = setInterval(load, 60 * 60 * 1000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  // Live SGP4 propagation — refresh every 30 s so sub-point visibly updates
  useEffect(() => {
    let alive = true;

    async function loadTle() {
      setTleLoading(true);
      try {
        const res = await fetch("/api/tle");
        if (!res.ok) return; // silent — don't disrupt main table
        const json = (await res.json()) as TleResponse;
        if (!alive) return;
        const map = new Map<number, TleRecord>();
        for (const rec of json.records ?? []) {
          map.set(rec.norad_id, rec);
        }
        setTleMap(map);
      } catch {
        // Non-fatal — SGP4 data is supplemental
      } finally {
        if (alive) setTleLoading(false);
      }
    }

    loadTle();
    const id = setInterval(loadTle, 30_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const sats = data?.satellites ?? [];

  return (
    <div className="flex flex-col gap-4 animate-fade-in">

      {/* Header row */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="text-[11px] font-mono font-bold tracking-widest uppercase" style={{ color: "var(--cyan)" }}>
            Constellation Fleet
          </p>
          <p className="text-[10px] font-mono mt-0.5" style={{ color: "var(--muted)" }}>
            {loading ? "Fetching live TLEs from CelesTrak…" :
             error    ? `Source: CelesTrak · ${error}` :
             `${sats.length} satellites · Live TLE data · Refreshed ${fetchedAt}`}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {(["LEO","MEO","GEO","HEO"] as SatelliteRecord["band"][]).map((b) => (
            <span key={b} className="text-[9px] font-mono px-2 py-0.5 rounded-full"
              style={{ background: `${BAND_COLOR[b]}18`, border: `1px solid ${BAND_COLOR[b]}44`, color: BAND_COLOR[b] }}>
              {b}
            </span>
          ))}
          <span className="text-[9px] font-mono px-2 py-0.5 rounded-full"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--muted)" }}>
            SOURCE: CELESTRAK
          </span>
        </div>
      </div>

      {/* Error state */}
      {error && !loading && (
        <div className="glass rounded-xl px-4 py-3 text-[11px] font-mono"
          style={{ color: "var(--amber)", borderColor: "rgba(251,191,36,0.3)" }}>
          ⚠ CelesTrak unavailable — {error}. Live data will retry on next refresh.
        </div>
      )}

      {/* Table */}
      <div className="glass rounded-xl overflow-hidden">
        {/* Header */}
        <div className="grid font-mono text-[9px] tracking-widest uppercase px-4 py-2"
          style={{
            gridTemplateColumns: "1fr 60px 110px 80px 80px",
            color: "var(--muted)",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}>
          <span>Satellite / NORAD</span>
          <span>Band</span>
          <span>Orbit (alt · inc)</span>
          <span>Period</span>
          <span>Altitude</span>
        </div>

        {/* Skeleton while loading */}
        {loading && Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)}

        {/* Rows */}
        {!loading && sats.map((sat, i) => {
          const tle = tleMap.get(sat.norad_id);
          return (
          <div
            key={sat.norad_id}
            className="grid items-center px-4 py-2.5 font-mono text-[11px]"
            style={{
              gridTemplateColumns: "1fr 60px 110px 80px 80px",
              background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)",
              borderBottom: i < sats.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
            }}
          >
            {/* Name + NORAD + live SGP4 sub-point */}
            <div className="flex flex-col min-w-0">
              <span className="truncate" style={{ color: "var(--foreground)" }}>{sat.name}</span>
              <span className="text-[9px]" style={{ color: "var(--muted)" }}>NORAD {sat.norad_id}</span>
              {/* Live SGP4 Lat/Lon + velocity sub-line */}
              {tleLoading && !tle ? (
                <span className="text-[9px] font-mono animate-pulse" style={{ color: "rgba(255,255,255,0.18)" }}>
                  propagating…
                </span>
              ) : tle ? (
                <span className="text-[9px] font-mono tabular-nums" style={{ color: "var(--cyan)", opacity: 0.85 }}>
                  {tle.lat_deg >= 0 ? `${tle.lat_deg}°N` : `${Math.abs(tle.lat_deg)}°S`}{" "}
                  {tle.lon_deg >= 0 ? `${tle.lon_deg}°E` : `${Math.abs(tle.lon_deg)}°W`}
                  {" · "}{tle.velocity_kms} km/s
                </span>
              ) : null}
            </div>

            {/* Band */}
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded w-fit"
              style={{ background: `${BAND_COLOR[sat.band]}18`, color: BAND_COLOR[sat.band] }}>
              {sat.band}
            </span>

            {/* Orbit */}
            <span className="text-[10px] tabular-nums" style={{ color: "rgba(255,255,255,0.55)" }}>
              {sat.altitude_km.toLocaleString()} km · {sat.inclination_deg}°
            </span>

            {/* Period */}
            <span className="tabular-nums" style={{ color: "rgba(255,255,255,0.5)" }}>
              {sat.period_min} min
            </span>

            {/* Altitude bar */}
            <BarCell value={sat.altitude_km} max={36000} color={BAND_COLOR[sat.band]} />
          </div>
          );
        })}

        {/* No data */}
        {!loading && !error && sats.length === 0 && (
          <div className="px-4 py-6 text-center font-mono text-[11px]" style={{ color: "var(--muted)" }}>
            No satellite records loaded.
          </div>
        )}
      </div>

      <p className="text-[9px] font-mono" style={{ color: "var(--muted)" }}>
        Live orbital data from CelesTrak satcat API (celestrak.org) ·
        Altitude = mean of apogee + perigee
      </p>
    </div>
  );
}
