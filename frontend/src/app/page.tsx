"use client";

import { useState, useEffect, useRef, KeyboardEvent, useCallback } from "react";
import toast from "react-hot-toast";
import SentinelPanel, { SentinelData, AsteroidItem, eyesUrl, jplOrbitUrl } from "@/components/SentinelPanel";
import ForecasterPanel, { ForecasterData, FlareItem } from "@/components/ForecasterPanel";
import ArchivistPanel, { ArchivistData } from "@/components/ArchivistPanel";
import TelemetryConsole, { TelemetryLog } from "@/components/TelemetryConsole";
import DetailPanel from "@/components/DetailPanel";
import MitigationBanner from "@/components/MitigationBanner";
import Sidebar, { ViewId } from "@/components/Sidebar";
import AnalyticsView from "@/components/AnalyticsView";
import ConstellationFleet from "@/components/ConstellationFleet";
import MissionActivityLog from "@/components/MissionActivityLog";
import GroundRelayGrid from "@/components/GroundRelayGrid";
import SystemStatusModal from "@/components/SystemStatusModal";

type AgentResult =
  | (SentinelData & { intent: "sentinel" })
  | (ForecasterData & { intent: "forecaster" })
  | (ArchivistData & { intent: "archivist" })
  | { intent: "error"; error: string }
  | null;

/* ── Mission clock — live UTC + MET T+ ──────────────────────────────────── */
const MET_EPOCH = new Date("2025-01-01T00:00:00Z"); // mission epoch

function useMissionClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  if (!now) return { utc: "──:──:──", met: "T+──:──:──" };

  const utc = `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}`;

  const elapsed = Math.floor((now.getTime() - MET_EPOCH.getTime()) / 1000);
  const hh = Math.floor(elapsed / 3600);
  const mm = Math.floor((elapsed % 3600) / 60);
  const ss = elapsed % 60;
  const met = `T+${pad(hh, 2)}:${pad(mm)}:${pad(ss)}`;

  return { utc, met };
}

/* ── IBM watsonx gateway latency ping ────────────────────────────────────── */
function WatsonxPing() {
  const [latency, setLatency] = useState<number | null>(null);
  const [status,  setStatus]  = useState<"online" | "offline" | "pending">("pending");

  const ping = useCallback(async () => {
    const t0 = performance.now();
    try {
      await fetch("/api/agent", { method: "HEAD" });
      const ms = Math.round(performance.now() - t0);
      setLatency(ms);
      setStatus("online");
    } catch {
      setStatus("offline");
      setLatency(null);
    }
  }, []);

  useEffect(() => {
    ping();
    const id = setInterval(ping, 30_000);
    return () => clearInterval(id);
  }, [ping]);

  const color  = status === "online"  ? "var(--emerald)"
               : status === "offline" ? "var(--red)"
               : "var(--amber)";
  const label  = status === "online"  ? "IBM WATSONX: ONLINE"
               : status === "offline" ? "IBM WATSONX: OFFLINE"
               : "IBM WATSONX: …";

  return (
    <div
      className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg shrink-0"
      style={{
        background: `${color}0f`,
        border: `1px solid ${color}33`,
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ background: color, boxShadow: `0 0 5px ${color}` }}
      />
      <span
        className="font-mono text-[10px] font-semibold tracking-widest uppercase"
        style={{ color }}
      >
        {label}
      </span>
      {latency !== null && (
        <span
          className="font-mono text-[10px] tabular-nums"
          style={{ color: "rgba(255,255,255,0.35)" }}
        >
          {latency}ms
        </span>
      )}
    </div>
  );
}

/* ── Web Speech API type shim ─────────────────────────────────────────────── */
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}
interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}
declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  }
}

/* ── Full-page Orbit Viewer ───────────────────────────────────────────────── */
function OrbitViewerPage({
  activeAsteroid,
  allAsteroids,
}: {
  activeAsteroid: AsteroidItem | null;
  allAsteroids: AsteroidItem[];
}) {
  const [selected, setSelected] = useState<AsteroidItem | null>(null);
  const target = selected ?? activeAsteroid;

  const noData = !target;
  const list = allAsteroids.slice(0, 20);

  return (
    <div className="flex flex-col gap-3 animate-fade-in flex-1 min-h-0">

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-2 shrink-0">
        <div>
          <p className="text-[11px] font-mono font-bold tracking-widest uppercase" style={{ color: "var(--cyan)" }}>
            Orbit Viewer
          </p>
          <p className="text-[10px] font-mono mt-0.5" style={{ color: "var(--muted)" }}>
            {noData
              ? "Run a Sentinel query first to load asteroid data"
              : `Viewing: ${target.name}${target.is_potentially_hazardous ? " · ⬡ PHO" : ""}`}
          </p>
        </div>
        {target && (
          <div className="flex gap-2">
            <a
              href={eyesUrl(target)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono text-[10px] font-bold tracking-widest uppercase"
              style={{
                background: "rgba(0,210,230,0.10)",
                border: "1px solid rgba(0,210,230,0.3)",
                color: "var(--cyan)",
                textDecoration: "none",
              }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
              Open Full Screen
            </a>
            <a
              href={jplOrbitUrl(target)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono text-[10px] font-bold tracking-widest uppercase"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.14)",
                color: "rgba(255,255,255,0.6)",
                textDecoration: "none",
              }}
            >
              JPL Orbit Data
            </a>
          </div>
        )}
      </div>

      {/* ── No data state ───────────────────────────────────────────────── */}
      {noData && (
        <div className="flex flex-col items-center justify-center flex-1 gap-4 rounded-xl"
          style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", minHeight: 400 }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
            <ellipse cx="12" cy="12" rx="10" ry="4" />
            <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(60 12 12)" />
            <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(120 12 12)" />
            <circle cx="12" cy="12" r="2" fill="var(--muted)" stroke="none" />
          </svg>
          <div className="text-center">
            <p className="font-mono text-[12px] font-semibold" style={{ color: "var(--muted)" }}>No asteroid loaded</p>
            <p className="font-mono text-[10px] mt-1" style={{ color: "var(--muted)", opacity: 0.6 }}>
              Go to Telemetry Core and run a Sentinel query, then return here
            </p>
          </div>
        </div>
      )}

      {/* ── Viewer + asteroid selector ──────────────────────────────────── */}
      {target && (
        <div className="flex gap-3 flex-1 min-h-0">

          {/* iframe — explicit height matches the sidebar so both fill to bottom */}
          <div className="flex-1 rounded-xl overflow-hidden relative"
            style={{ background: "#000", border: "1px solid var(--border)", height: "calc(100vh - 180px)" }}>
            <iframe
              key={eyesUrl(target)}
              src={eyesUrl(target)}
              title={`NASA Eyes on the Solar System · ${target.name}`}
              allow="fullscreen"
              style={{ width: "100%", height: "100%", border: "none", display: "block" }}
            />
            {/* corner badge */}
            <div className="absolute top-2 left-3 pointer-events-none">
              <span className="font-mono text-[8px] tracking-widest uppercase px-2 py-0.5 rounded"
                style={{ background: "rgba(0,0,0,0.65)", color: "rgba(0,210,230,0.8)", border: "1px solid rgba(0,210,230,0.2)" }}>
                NASA EYES · LIVE · INTERACTIVE
              </span>
            </div>
          </div>

          {/* Asteroid selector sidebar — fixed height = full viewport minus header+footer chrome */}
          {list.length > 0 && (
            <div className="shrink-0 flex flex-col rounded-xl"
              style={{
                width: 196,
                height: "calc(100vh - 180px)",
                background: "rgba(255,255,255,0.02)",
                border: "1px solid var(--border)",
              }}>
              <p className="font-mono text-[8px] tracking-widest uppercase px-3 py-2 shrink-0"
                style={{ color: "var(--muted)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                Switch Target · {list.length} objects
              </p>
              {/* scrollable list — flex-1 fills everything below the header row */}
              <div className="flex-1 overflow-y-auto scrollbar-thin flex flex-col gap-0.5 p-2" style={{ minHeight: 0 }}>
              {list.map((a) => {
                const isActive = (selected ?? activeAsteroid)?.name === a.name;
                return (
                  <button
                    key={a.name}
                    onClick={() => setSelected(a)}
                    className="flex flex-col gap-0.5 px-2 py-2 rounded-lg text-left transition-all"
                    style={{
                      background: isActive ? "rgba(0,210,230,0.09)" : "transparent",
                      border: isActive ? "1px solid rgba(0,210,230,0.25)" : "1px solid transparent",
                    }}
                  >
                    <span className="font-mono text-[10px] font-semibold leading-snug"
                      style={{ color: isActive ? "var(--cyan)" : "rgba(255,255,255,0.75)", wordBreak: "break-word" }}>
                      {a.name}
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {a.is_potentially_hazardous && (
                        <span className="font-mono text-[8px] font-bold" style={{ color: "var(--red)" }}>⬡ PHO</span>
                      )}
                      <span className="font-mono text-[8px]" style={{ color: "var(--muted)" }}>
                        {a.miss_distance_km?.toLocaleString() ?? "—"} km
                      </span>
                      <span className="font-mono text-[8px]" style={{ color: "var(--muted)" }}>
                        {a.close_approach_date}
                      </span>
                    </div>
                  </button>
                );
              })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Footer hint */}
      <p className="font-mono text-[9px] shrink-0" style={{ color: "var(--muted)" }}>
        Drag to rotate · Scroll to zoom · Source: NASA JPL Eyes on the Solar System (eyes.nasa.gov)
      </p>
    </div>
  );
}


export default function Home() {
  const [query, setQuery]   = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AgentResult>(null);
  const [error, setError]   = useState<string | null>(null);

  const { utc, met } = useMissionClock();

  // View state
  const [view, setView] = useState<ViewId>("telemetry");
  const [exporting, setExporting] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);

  // Voice command
  const [listening,      setListening]      = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [voiceError,     setVoiceError]     = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const logRefreshRef  = useRef<(() => void) | null>(null);

  useEffect(() => {
    setVoiceSupported(
      typeof window !== "undefined" &&
      !!(window.SpeechRecognition || window.webkitSpeechRecognition)
    );
  }, []);

  function toggleVoice() {
    setVoiceError(null);
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SR) return;
    const recognition = new SR();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (e: SpeechRecognitionEvent) => {
      const transcript = e.results[0]?.[0]?.transcript ?? "";
      if (transcript) setQuery(transcript);
    };
    recognition.onerror = (e: SpeechRecognitionErrorEvent) => {
      setListening(false);
      if (e.error === "not-allowed") {
        setVoiceError("Microphone access denied — allow mic permission in your browser and reload.");
      } else if (e.error === "network") {
        setVoiceError("Voice recognition needs an internet connection (Chrome sends audio to Google).");
      } else {
        setVoiceError(`Voice error: ${e.error}`);
      }
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  // Telemetry console
  const [consoleLogs, setConsoleLogs] = useState<TelemetryLog[]>([]);
  const [consoleOpen, setConsoleOpen] = useState(false);

  // Detail panel
  const [detailItem, setDetailItem] = useState<AsteroidItem | FlareItem | null>(null);
  const [detailType, setDetailType] = useState<"asteroid" | "flare" | null>(null);

  const activeIntent =
    result && result.intent !== "error" ? result.intent : null;

  function addLog(level: TelemetryLog["level"], msg: string) {
    const now = new Date();
    const ts = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}.${String(now.getMilliseconds()).padStart(3, "0")}`;
    setConsoleLogs((prev) => [...prev, { ts, level, msg }]);
  }

  async function transmit() {
    if (!query.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setConsoleLogs([]);
    setConsoleOpen(true);

    addLog("INFO",  "ORION Space Command — session initialized");
    addLog("ROUTE", "Dispatching query to ORION Master Router (watsonx)...");
    addLog("LLM",   "watsonx · llama-4-maverick-17b → intent classification");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90_000);

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim() }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      const data: AgentResult = (await res.json()) as AgentResult;
      setResult(data);
      if (data?.intent === "error") {
        const errMsg = (data as { intent: "error"; error: string }).error;
        setError(errMsg);
        addLog("WARN", errMsg);
      } else if (data) {
        addLog("ROUTE", `Intent resolved: ${data.intent}`);
        addLog("FETCH", "Calling sub-agent flow...");
        addLog("OK",    `Response received — ${JSON.stringify(data).length} bytes`);
      }
    } catch (e) {
      clearTimeout(timer);
      if (e instanceof DOMException && e.name === "AbortError") {
        const msg = "Request timed out — watsonx or NASA API is taking too long. Please try again.";
        setError(msg);
        addLog("WARN", msg);
      } else {
        const msg = e instanceof Error ? e.message : "Unknown error";
        setError(msg);
        addLog("WARN", msg);
      }
    } finally {
      setLoading(false);
      // Give Supabase ~1 s to commit the row written by the agent route, then refresh
      setTimeout(() => { logRefreshRef.current?.(); }, 1200);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") transmit();
  }

  function openAsteroid(item: AsteroidItem) { setDetailItem(item); setDetailType("asteroid"); }
  function openFlare(item: FlareItem)        { setDetailItem(item); setDetailType("flare"); }
  function closeDetail()                     { setDetailItem(null); setDetailType(null); }

  async function handleExportPdf() {
    setExporting(true);
    try {
      const { exportBriefing } = await import("@/lib/exportPdf");
      await exportBriefing(result, consoleLogs, lastForecaster, lastSentinel);
      toast.success("[OK] Mission Briefing exported successfully");
    } catch {
      toast.error("[WARN] Export failed — please try again");
    } finally {
      setExporting(false);
    }
  }

  // Accumulate last-seen data for all agents so panels persist
  // across intent switches (e.g. querying forecaster doesn't wipe sentinel)
  const [lastForecaster, setLastForecaster] = useState<ForecasterData | null>(null);
  const [lastSentinel,   setLastSentinel]   = useState<SentinelData   | null>(null);
  const [lastArchivist,  setLastArchivist]  = useState<ArchivistData  | null>(null);

  useEffect(() => {
    if (result?.intent === "forecaster") setLastForecaster(result as ForecasterData);
    if (result?.intent === "sentinel")   setLastSentinel(result as SentinelData);
    if (result?.intent === "archivist")  setLastArchivist(result as ArchivistData);
  }, [result]);

  const forecasterData    = lastForecaster;
  const sentinelData      = lastSentinel;
  const archivistData     = lastArchivist;
  const archivistLoading  = loading && (!activeIntent || activeIntent === "archivist");

  return (
    <div className="h-screen flex flex-col" style={{ background: "var(--bg)" }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-20 glass flex items-center gap-3 px-4"
        style={{
          borderRadius: 0,
          borderLeft: "none", borderRight: "none", borderTop: "none",
          height: 52,
        }}
      >
        {/* ── Zone 1: Logo + Active Uplink (always visible) ─────────────── */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Hex logo */}
          <div className="flex items-center gap-2 shrink-0">
            <svg width="22" height="22" viewBox="0 0 28 28" fill="none">
              <polygon points="14,2 25,8 25,20 14,26 3,20 3,8" stroke="var(--cyan)" strokeWidth="1.5" fill="none" opacity="0.8" />
              <polygon points="14,7 21,11 21,18 14,22 7,18 7,11" fill="var(--cyan)" opacity="0.18" />
              <circle cx="14" cy="14" r="2.5" fill="var(--cyan)" opacity="0.9" />
            </svg>
            <div className="leading-none">
              <p className="font-mono font-bold text-[13px] tracking-[0.2em] uppercase text-white">ORION</p>
              <p className="hidden sm:block text-[9px] tracking-widest uppercase" style={{ color: "var(--muted)" }}>Space Command</p>
            </div>
          </div>

          {/* Divider — only md+ */}
          <div className="hidden md:block h-5 w-px shrink-0" style={{ background: "rgba(255,255,255,0.1)" }} />

          {/* Active uplink — only md+ */}
          <div className="hidden md:flex items-center gap-1.5">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                style={{ background: "var(--emerald)" }} />
              <span className="relative inline-flex rounded-full h-2 w-2"
                style={{ background: "var(--emerald)" }} />
            </span>
            <span className="font-mono text-[10px] tracking-widest uppercase"
              style={{ color: "var(--emerald)" }}>UPLINK:</span>
            <span className="font-mono text-[10px]"
              style={{ color: "rgba(255,255,255,0.55)" }}>GLOBAL DSN‑01</span>
          </div>

          {/* Uplink dot only — xs/sm fallback */}
          <span className="flex md:hidden relative h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
              style={{ background: "var(--emerald)" }} />
            <span className="relative inline-flex rounded-full h-2 w-2"
              style={{ background: "var(--emerald)" }} />
          </span>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* ── Zone 2: Global System Status (sm+) ───────────────────────── */}
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full shrink-0"
          style={{
            background: "rgba(52,211,153,0.08)",
            border: "1px solid rgba(52,211,153,0.25)",
          }}>
          <span className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ background: "var(--emerald)", boxShadow: "0 0 5px var(--emerald)" }} />
          <span className="font-mono text-[10px] tracking-widest uppercase font-semibold"
            style={{ color: "var(--emerald)" }}>
            <span className="hidden lg:inline">STATUS: </span>NOMINAL
          </span>
        </div>

        {/* ── Zone 3: Mission Clock (md+) ──────────────────────────────── */}
        <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg shrink-0"
          style={{
            background: "rgba(0,210,230,0.06)",
            border: "1px solid rgba(0,210,230,0.15)",
          }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--cyan)" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
          </svg>
          <span className="font-mono text-[11px] font-semibold tracking-widest tabular-nums"
            style={{ color: "var(--cyan)" }}>{utc} Z</span>
          <span className="hidden lg:inline font-mono text-[10px]"
            style={{ color: "rgba(255,255,255,0.2)" }}>|</span>
          <span className="hidden lg:inline font-mono text-[10px] tracking-widest tabular-nums"
            style={{ color: "rgba(255,255,255,0.4)" }}>MET {met}</span>
        </div>

        {/* ── Zone 4: watsonx Gateway Monitor (md+) ────────────────────── */}
        <WatsonxPing />
      </header>

      {/* ── Body (sidebar + main) ───────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">

        {/* Sidebar */}
        <Sidebar
          view={view}
          onView={setView}
          onExportPdf={handleExportPdf}
          onSystemStatus={() => setStatusOpen(true)}
          exporting={exporting}
        />

        {/* Main content */}
        <main className="flex-1 flex flex-col gap-5 px-5 py-5 max-w-screen-xl w-full mx-auto pb-16 min-h-0 overflow-y-auto">

          {/* Query bar */}
          <div
            className={`glass flex gap-2 p-2${loading ? " glass-loading" : ""}`}
            style={{ borderRadius: "14px" }}
          >
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={loading}
              placeholder='Enter mission query — e.g. "show me approaching asteroids"'
              className="flex-1 bg-transparent px-3 py-2 text-sm font-mono outline-none placeholder:text-[var(--muted)] disabled:opacity-50 text-[var(--foreground)]"
            />

            {voiceSupported && (
              <button
                type="button"
                onClick={toggleVoice}
                disabled={loading}
                title={listening ? "Stop listening" : "Speak your query"}
                aria-label={listening ? "Stop voice input" : "Start voice input"}
                className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
                style={{
                  background: listening ? "rgba(248,113,113,0.15)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${listening ? "rgba(248,113,113,0.4)" : "rgba(255,255,255,0.08)"}`,
                  color: listening ? "var(--red)" : "var(--muted)",
                }}
              >
                {listening ? (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="4" y="4" width="16" height="16" rx="2" />
                  </svg>
                ) : (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="2" width="6" height="12" rx="3" />
                    <path d="M5 10a7 7 0 0 0 14 0" />
                    <line x1="12" y1="19" x2="12" y2="22" />
                    <line x1="9"  y1="22" x2="15" y2="22" />
                  </svg>
                )}
              </button>
            )}

            <button
              onClick={transmit}
              disabled={loading || !query.trim()}
              className="px-5 py-2 rounded-[10px] text-xs font-mono font-semibold tracking-widest uppercase transition-all duration-200
                disabled:opacity-25 disabled:saturate-0 disabled:cursor-not-allowed flex items-center gap-2 shrink-0"
              style={{ background: "var(--cyan)", color: "#04090f" }}
            >
              {loading ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-80" fill="currentColor"
                      d="M12 2a10 10 0 0 1 10 10h-3a7 7 0 0 0-7-7V2z" />
                  </svg>
                  Routing
                </>
              ) : "Transmit"}
            </button>
          </div>

          {/* Voice error */}
          {voiceError && (
            <p className="font-mono text-[10px] px-1" style={{ color: "var(--red)" }}>
              ⚠ {voiceError}
            </p>
          )}

          {/* Error banner */}
          {error && (
            <div
              className="glass rounded-xl px-4 py-3 text-sm font-mono animate-fade-in"
              style={{
                borderColor: "rgba(248,113,113,0.3)",
                color: "var(--red)",
                background: "var(--red-dim)",
                wordBreak: "break-all",
                overflowWrap: "anywhere",
                whiteSpace: "pre-wrap",
                overflow: "visible",
                maxHeight: "none",
                textOverflow: "unset",
              }}
            >
              <span className="opacity-70 mr-2 font-mono">[WARN]</span>{error}
            </div>
          )}

          {/* Mitigation banner — only shown when live X-flare or PHO data present */}
          <MitigationBanner forecaster={forecasterData} sentinel={sentinelData} />

          {/* ── Telemetry view ─────────────────────────────────────────── */}
          {view === "telemetry" && (
            <div
              className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1 min-h-0"
              style={{ gridAutoRows: "minmax(450px, 1fr)", alignItems: "stretch" }}
            >
              <SentinelPanel
                data={result?.intent === "sentinel" ? (result as SentinelData) : null}
                loading={loading && (!activeIntent || activeIntent === "sentinel")}
                active={activeIntent === "sentinel" || activeIntent === null}
                dimmed={activeIntent !== null && activeIntent !== "sentinel"}
                onSelectItem={openAsteroid}
              />
              <ForecasterPanel
                data={result?.intent === "forecaster" ? (result as ForecasterData) : null}
                loading={loading && (!activeIntent || activeIntent === "forecaster")}
                active={activeIntent === "forecaster" || activeIntent === null}
                dimmed={activeIntent !== null && activeIntent !== "forecaster"}
                onSelectItem={openFlare}
              />
              <ArchivistPanel
                data={result?.intent === "archivist" ? (result as ArchivistData) : null}
                loading={loading && (!activeIntent || activeIntent === "archivist")}
                active={activeIntent === "archivist" || activeIntent === null}
                dimmed={activeIntent !== null && activeIntent !== "archivist"}
              />
            </div>
          )}

          {/* ── Analytics / Threat & Risk view ─────────────────────────── */}
          {view === "analytics" && (
            <AnalyticsView
              forecaster={forecasterData}
              exporting={exporting}
              archivist={archivistData}
              archivistLoading={archivistLoading}
            />
          )}

          {/* ── Constellation Fleet ─────────────────────────────────────── */}
          {view === "fleet" && <ConstellationFleet />}

          {/* ── Mission Activity Log ────────────────────────────────────── */}
          {view === "log" && <MissionActivityLog logs={consoleLogs} refreshRef={logRefreshRef} />}

          {/* ── Ground Relay Grid ───────────────────────────────────────── */}
          {view === "ground" && <GroundRelayGrid />}

          {/* ── Orbit Viewer — full-page NASA Eyes embed ────────────────── */}
          {view === "orbit" && (
            <OrbitViewerPage
              activeAsteroid={sentinelData?.items?.length
                ? (sentinelData.items.find(a => a.is_potentially_hazardous) ??
                   sentinelData.items.reduce((a, b) =>
                     (a.miss_distance_km ?? Infinity) <= (b.miss_distance_km ?? Infinity) ? a : b))
                : null}
              allAsteroids={sentinelData?.items ?? []}
            />
          )}

        </main>
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="px-6 py-3 text-center text-[11px] font-mono tracking-wide"
        style={{ color: "var(--muted)", borderTop: "1px solid var(--border)" }}>
        Powered by{" "}
        <span className="text-white/70 font-semibold">IBM watsonx</span>
        {" "}·{" "}Llama-4 Maverick · NASA APIs · IBM Docling · Supabase
      </footer>

      {/* ── System status modal ────────────────────────────────────────── */}
      <SystemStatusModal open={statusOpen} onClose={() => setStatusOpen(false)} />

      {/* ── Detail panel ───────────────────────────────────────────────── */}
      <DetailPanel item={detailItem} type={detailType} onClose={closeDetail} />

      {/* ── Telemetry console ──────────────────────────────────────────── */}
      <TelemetryConsole
        logs={consoleLogs}
        isOpen={consoleOpen}
        onToggle={() => setConsoleOpen((o) => !o)}
      />
    </div>
  );
}
