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

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim() }),
      });
      const data: AgentResult = await res.json() as AgentResult;
      setResult(data);
      if (data?.intent === "error") {
        setError((data as { intent: "error"; error: string }).error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") transmit();
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--background)" }}>
      {/* ── Header ── */}
      <header className="border-b border-[var(--panel-border)] px-6 py-4 flex items-center justify-between">
        <div>
          <h1
            className="font-mono font-bold text-2xl tracking-[0.2em] uppercase"
            style={{ color: "var(--accent-cyan)", textShadow: "0 0 18px rgba(0,212,255,0.4)" }}
          >
            ORION
          </h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
            Orbital Research &amp; Intelligence Orchestration Network
          </p>
        </div>

        {/* Status dots */}
        <div className="flex items-center gap-4 text-xs" style={{ color: "var(--muted)" }}>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-green-400" />
            LANGFLOW ONLINE
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-green-400" />
            WATSONX ONLINE
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-green-400" />
            NASA API ONLINE
          </span>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="flex-1 flex flex-col gap-6 px-6 py-6 max-w-screen-xl w-full mx-auto">
        {/* Chat input bar */}
        <div className="flex gap-3">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={loading}
            placeholder="Enter mission query... (e.g. 'show me approaching asteroids')"
            className="flex-1 rounded-lg px-4 py-2.5 text-sm font-mono outline-none disabled:opacity-50 transition-all"
            style={{
              background: "var(--panel-bg)",
              border: "1px solid var(--panel-border)",
              color: "var(--foreground)",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "var(--accent-cyan)";
              e.currentTarget.style.boxShadow = "0 0 0 2px rgba(0,212,255,0.2)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "var(--panel-border)";
              e.currentTarget.style.boxShadow = "none";
            }}
          />
          <button
            onClick={transmit}
            disabled={loading || !query.trim()}
            className="px-5 py-2.5 rounded-lg text-sm font-mono font-bold uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
            style={{
              background: "var(--accent-cyan)",
              color: "#050a14",
            }}
          >
            {loading ? (
              <>
                <svg
                  className="w-4 h-4 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 100 16v-4l-3 3 3 3v-4a8 8 0 01-8-8z" />
                </svg>
                ROUTING...
              </>
            ) : (
              "TRANSMIT"
            )}
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div
            className="rounded-lg px-4 py-3 text-sm font-mono border"
            style={{
              background: "rgba(239,68,68,0.1)",
              borderColor: "var(--accent-red)",
              color: "#fca5a5",
            }}
          >
            ⚠ {error}
          </div>
        )}

        {/* Three-panel grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1">
          <SentinelPanel
            data={result?.intent === "sentinel" ? (result as SentinelData) : null}
            loading={loading}
            active={activeIntent === "sentinel" || activeIntent === null}
          />
          <ForecasterPanel
            data={result?.intent === "forecaster" ? (result as ForecasterData) : null}
            loading={loading}
            active={activeIntent === "forecaster" || activeIntent === null}
          />
          <ArchivistPanel
            data={result?.intent === "archivist" ? (result as ArchivistData) : null}
            loading={loading}
            active={activeIntent === "archivist" || activeIntent === null}
          />
        </div>
      </main>

      {/* ── Footer ── */}
      <footer
        className="border-t border-[var(--panel-border)] px-6 py-3 text-center text-xs"
        style={{ color: "var(--muted)" }}
      >
        Powered by{" "}
        <span className="font-semibold" style={{ color: "var(--foreground)" }}>
          IBM watsonx Granite
        </span>{" "}
        · Langflow · NASA APIs · IBM Docling
      </footer>

      {/* Dim inactive panels via JS when a result is active */}
      {activeIntent !== null && (
        <style>{`
          .panel-inactive { opacity: 0.55; }
        `}</style>
      )}
    </div>
  );
}
