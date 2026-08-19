"use client";

import { useState, KeyboardEvent } from "react";
import SentinelPanel, { SentinelData } from "@/components/SentinelPanel";
import ForecasterPanel, { ForecasterData } from "@/components/ForecasterPanel";
import ArchivistPanel, { ArchivistData } from "@/components/ArchivistPanel";

type AgentResult =
  | (SentinelData & { intent: "sentinel" })
  | (ForecasterData & { intent: "forecaster" })
  | (ArchivistData & { intent: "archivist" })
  | { intent: "error"; error: string }
  | null;

export default function Home() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AgentResult>(null);
  const [error, setError] = useState<string | null>(null);

  const activeIntent =
    result && result.intent !== "error" ? result.intent : null;

  async function transmit() {
    if (!query.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);

    const controller = new AbortController();
    // 120 s hard timeout — two LLM calls (router + sub-agent) + NASA API can take 40-80s
    const timer = setTimeout(() => controller.abort(), 120_000);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim() }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      const data: AgentResult = (await res.json()) as AgentResult;
      setResult(data);
      if (data?.intent === "error") {
        setError((data as { intent: "error"; error: string }).error);
      }
    } catch (e) {
      clearTimeout(timer);
      if (e instanceof DOMException && e.name === "AbortError") {
        setError("Request timed out after 120 s. LangFlow is running but the model took too long — try again.");
      } else {
        setError(e instanceof Error ? e.message : "Unknown error");
      }
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") transmit();
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 flex items-center justify-between px-6 py-3 glass"
        style={{ borderRadius: 0, borderLeft: "none", borderRight: "none", borderTop: "none" }}>

        {/* Wordmark */}
        <div className="flex items-center gap-3">
          {/* hex icon */}
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <polygon
              points="14,2 25,8 25,20 14,26 3,20 3,8"
              stroke="var(--cyan)" strokeWidth="1.5" fill="none" opacity="0.8"
            />
            <polygon
              points="14,7 21,11 21,18 14,22 7,18 7,11"
              fill="var(--cyan)" opacity="0.18"
            />
            <circle cx="14" cy="14" r="2.5" fill="var(--cyan)" opacity="0.9" />
          </svg>
          <div>
            <h1 className="font-mono font-bold text-base tracking-[0.22em] uppercase text-white leading-none">
              ORION
            </h1>
            <p className="text-[10px] tracking-widest uppercase mt-0.5" style={{ color: "var(--muted)" }}>
              Space Command
            </p>
          </div>
        </div>

        {/* Status indicators */}
        <div className="hidden sm:flex items-center gap-5">
          {[
            { label: "LangFlow", ok: true },
            { label: "watsonx",  ok: true },
            { label: "NASA API", ok: true },
          ].map(({ label, ok }) => (
            <span key={label} className="flex items-center gap-1.5 text-[11px] font-mono tracking-wide" style={{ color: "var(--muted)" }}>
              <span className={`w-1.5 h-1.5 rounded-full ${ok ? "bg-emerald-400" : "bg-red-400"}`}
                style={ok ? { boxShadow: "0 0 5px var(--emerald)" } : {}} />
              {label}
            </span>
          ))}
        </div>
      </header>

      {/* ── Main ───────────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col gap-5 px-5 py-5 max-w-screen-xl w-full mx-auto">

        {/* Query bar */}
        <div className="glass flex gap-2 p-2" style={{ borderRadius: "14px" }}>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={loading}
            placeholder='Enter mission query — e.g. "show me approaching asteroids"'
            className="flex-1 bg-transparent px-3 py-2 text-sm font-mono outline-none placeholder:text-[var(--muted)] disabled:opacity-50 text-[var(--foreground)]"
          />
          <button
            onClick={transmit}
            disabled={loading || !query.trim()}
            className="px-5 py-2 rounded-[10px] text-xs font-mono font-semibold tracking-widest uppercase transition-all duration-200
              disabled:opacity-25 disabled:saturate-0 disabled:cursor-not-allowed flex items-center gap-2 shrink-0"
            style={{
              background: "var(--cyan)",
              color: "#04090f",
            }}
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
            <span className="opacity-70 mr-2">⚠</span>{error}
          </div>
        )}

        {/* ── Bento grid ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1 items-start">
          <SentinelPanel
            data={result?.intent === "sentinel" ? (result as SentinelData) : null}
            loading={loading && (!activeIntent || activeIntent === "sentinel")}
            active={activeIntent === "sentinel" || activeIntent === null}
            dimmed={activeIntent !== null && activeIntent !== "sentinel"}
          />
          <ForecasterPanel
            data={result?.intent === "forecaster" ? (result as ForecasterData) : null}
            loading={loading && (!activeIntent || activeIntent === "forecaster")}
            active={activeIntent === "forecaster" || activeIntent === null}
            dimmed={activeIntent !== null && activeIntent !== "forecaster"}
          />
          <ArchivistPanel
            data={result?.intent === "archivist" ? (result as ArchivistData) : null}
            loading={loading && (!activeIntent || activeIntent === "archivist")}
            active={activeIntent === "archivist" || activeIntent === null}
            dimmed={activeIntent !== null && activeIntent !== "archivist"}
          />
        </div>
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="px-6 py-3 text-center text-[11px] font-mono tracking-wide"
        style={{ color: "var(--muted)", borderTop: "1px solid var(--border)" }}>
        Powered by{" "}
        <span className="text-white/70 font-semibold">IBM watsonx Granite</span>
        {" "}·{" "}LangFlow · NASA APIs · IBM Docling
      </footer>
    </div>
  );
}
