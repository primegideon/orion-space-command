"use client";

import type { ForecasterData } from "@/components/ForecasterPanel";
import type { SentinelData } from "@/components/SentinelPanel";
import type { ArchivistData } from "@/components/ArchivistPanel";
import type { TelemetryLog } from "@/components/TelemetryConsole";

type AgentResult =
  | (SentinelData & { intent: "sentinel" })
  | (ForecasterData & { intent: "forecaster" })
  | (ArchivistData & { intent: "archivist" })
  | { intent: "error"; error: string }
  | null;

export async function exportBriefing(
  result: AgentResult,
  logs: TelemetryLog[]
) {
  // Dynamic imports — only pulled in client-side
  const [{ default: jsPDF }] = await Promise.all([
    import("jspdf"),
  ]);

  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
  const PAGE_W = doc.internal.pageSize.getWidth();
  const MARGIN = 40;
  const COL = PAGE_W - MARGIN * 2;
  let y = MARGIN;

  const muted = [100, 116, 139] as const;
  const cyan = [0, 210, 230] as const;
  const white = [230, 240, 255] as const;
  const red = [248, 113, 113] as const;
  const amber = [251, 191, 36] as const;

  // ── Background ──────────────────────────────────────────────────────────
  doc.setFillColor(4, 9, 15);
  doc.rect(0, 0, PAGE_W, doc.internal.pageSize.getHeight(), "F");

  function nl(px = 10) { y += px; }
  function line(color = muted as readonly number[]) {
    doc.setDrawColor(...(color as [number, number, number]));
    doc.setLineWidth(0.5);
    doc.line(MARGIN, y, PAGE_W - MARGIN, y);
    nl(8);
  }
  function text(str: string, size: number, color: readonly number[], bold = false) {
    doc.setFontSize(size);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setTextColor(...(color as [number, number, number]));
    const wrapped = doc.splitTextToSize(str, COL);
    doc.text(wrapped, MARGIN, y);
    y += (size * 1.35) * wrapped.length;
  }

  // ── Header ───────────────────────────────────────────────────────────────
  text("ORION SPACE COMMAND", 18, cyan, true);
  text("MISSION INTELLIGENCE BRIEFING", 9, muted);
  nl(4);
  text(`Generated: ${new Date().toUTCString()}`, 8, muted);
  nl(8);
  line(cyan);

  // ── Threat status ─────────────────────────────────────────────────────────
  text("THREAT STATUS", 10, cyan, true);
  nl(4);
  if (!result || result.intent === "error") {
    text("No active mission data.", 9, muted);
  } else {
    text(`Intent: ${result.intent.toUpperCase()}`, 9, white);
    const body = "summary" in result ? (result as { summary: string }).summary
               : "answer"  in result ? (result as { answer: string }).answer
               : null;
    if (body) { nl(4); text(body, 9, white); }
  }
  nl(8);
  line();

  // ── Satellite insurance / financial risk ─────────────────────────────────
  text("SATELLITE INSURANCE & FINANCIAL RISK SNAPSHOT", 10, amber, true);
  nl(4);
  const risks = [
    ["Comm disruption (X-class flare)", "HIGH — ~$50M/day industry exposure"],
    ["LEO collision probability (PHO pass)", "ELEVATED — insurer watch status"],
    ["GPS signal degradation (M5+ flare)", "MODERATE — aviation/maritime impact"],
    ["Radiation damage (SAA transit)", "LOW — hardened shielding nominal"],
  ];
  risks.forEach(([evt, assessment]) => {
    text(`• ${evt}`, 9, muted);
    text(`  ${assessment}`, 9, white);
    nl(2);
  });
  nl(4);
  line();

  // ── Telemetry log snapshot ─────────────────────────────────────────────────
  text("TELEMETRY LOG SNAPSHOT", 10, cyan, true);
  nl(4);
  const last12 = logs.slice(-12);
  if (last12.length === 0) {
    text("No telemetry recorded.", 9, muted);
  } else {
    last12.forEach((l) => {
      const color = l.level === "WARN" ? red : l.level === "OK" ? [52, 211, 153] as const : muted;
      text(`[${l.ts}] [${l.level}] ${l.msg}`, 8, color);
      nl(1);
    });
  }
  nl(6);
  line();

  text("ORION Space Command · Powered by IBM watsonx · Confidential", 8, muted);

  doc.save(`orion-briefing-${Date.now()}.pdf`);
}
