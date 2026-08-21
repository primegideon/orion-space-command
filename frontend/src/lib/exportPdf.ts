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

/* ── Colour palette — light mode (charcoal on white) ──────────────────────*/
const C = {
  black:    [15,  20,  30]  as const,
  charcoal: [35,  45,  60]  as const,
  body:     [55,  65,  80]  as const,
  muted:    [110, 120, 140] as const,
  rule:     [200, 210, 220] as const,
  accent:   [0,   90,  160] as const,   // navy blue
  red:      [190, 30,  40]  as const,
  amber:    [160, 100, 0]   as const,
  green:    [20,  130, 80]  as const,
  white:    [255, 255, 255] as const,
  pageBg:   [250, 251, 252] as const,
  stripBg:  [240, 243, 248] as const,
};

/* ── Static fleet data (mirrors ConstellationFleet.tsx) ───────────────────*/
const FLEET = [
  { id: "OC-1",  name: "ORION-CORE-1",  band: "LEO", battery: 94,  health: "NOMINAL"  },
  { id: "OC-2",  name: "ORION-CORE-2",  band: "LEO", battery: 88,  health: "NOMINAL"  },
  { id: "OC-3",  name: "ORION-CORE-3",  band: "LEO", battery: 71,  health: "DEGRADED" },
  { id: "RS-9",  name: "RELAY-STAR-9",  band: "MEO", battery: 99,  health: "NOMINAL"  },
  { id: "RS-11", name: "RELAY-STAR-11", band: "MEO", battery: 97,  health: "NOMINAL"  },
  { id: "GS-4",  name: "GEO-SYNC-4",   band: "GEO", battery: 100, health: "NOMINAL"  },
  { id: "GS-7",  name: "GEO-SYNC-7",   band: "GEO", battery: 43,  health: "CRITICAL" },
  { id: "HO-2",  name: "HALO-ORB-2",   band: "HEO", battery: 82,  health: "NOMINAL"  },
  { id: "SC-1",  name: "SCOUT-1",       band: "LEO", battery: 12,  health: "OFFLINE"  },
  { id: "SC-2",  name: "SCOUT-2",       band: "LEO", battery: 78,  health: "NOMINAL"  },
];

/* ── Static LEO debris assets (mirrors AdvancedThreatMatrix.tsx) ──────────*/
const LEO_ASSETS = [
  { id: "ORION-1A", alt: 420, baseCollProb: 0.031, baseDrag: 1.14 },
  { id: "ORION-2B", alt: 550, baseCollProb: 0.019, baseDrag: 0.87 },
  { id: "ORION-3C", alt: 340, baseCollProb: 0.048, baseDrag: 1.62 },
  { id: "RELAY-9",  alt: 480, baseCollProb: 0.022, baseDrag: 1.05 },
];

/* ── Hardware mitigation recommendations ──────────────────────────────────*/
const MITIGATIONS = [
  "Orient solar arrays to low-drag profile during elevated thermospheric density.",
  "Enable safe-mode RCS hold on CRITICAL/OFFLINE assets until battery SoC > 30%.",
  "Switch comm links to X-band or Ka-band during UHF congestion events.",
  "Activate secondary radiation shielding on SAA-crossing LEO assets (X/M5+ flare).",
  "Engage GPS correction algorithms during R2+ HF blackout windows.",
  "Defer non-critical manoeuvres within 48 h of PHO close-approach window.",
];

function dragFromFlare(forecaster: ForecasterData | null) {
  let worstScore = 0;
  let worstClass = "NONE";
  for (const f of forecaster?.items ?? []) {
    const t = (f.class_type ?? "").toUpperCase();
    const letter = t.charAt(0);
    const num = parseFloat(t.slice(1)) || 0;
    let score = 0;
    if (letter === "X") score = 1000 + num;
    else if (letter === "M") score = 100 + num;
    else if (letter === "C") score = 10 + num;
    if (score > worstScore) { worstScore = score; worstClass = f.class_type ?? "NONE"; }
  }
  const dragBoost = worstScore >= 1000 ? 38 : worstScore >= 500 ? 28 : worstScore >= 100 ? 14 : worstScore >= 10 ? 5 : 0;
  const collDelta = worstScore >= 1000 ? 12 : worstScore >= 500 ? 8 : worstScore >= 100 ? 4 : worstScore >= 10 ? 1 : 0;
  return { dragBoost, collDelta, worstClass };
}

export async function exportBriefing(
  result: AgentResult,
  logs: TelemetryLog[]
) {
  const [{ default: jsPDF }] = await Promise.all([import("jspdf")]);

  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
  const PAGE_W = doc.internal.pageSize.getWidth();
  const PAGE_H = doc.internal.pageSize.getHeight();
  const MARGIN = 44;
  const COL = PAGE_W - MARGIN * 2;
  let y = MARGIN;

  /* ── Helpers ─────────────────────────────────────────────────────────── */
  function checkPage(needed = 40) {
    if (y + needed > PAGE_H - MARGIN) {
      doc.addPage();
      // Page background
      doc.setFillColor(...C.pageBg);
      doc.rect(0, 0, PAGE_W, PAGE_H, "F");
      y = MARGIN;
    }
  }

  function nl(px = 8) { y += px; }

  function rule(color = C.rule) {
    doc.setDrawColor(...color);
    doc.setLineWidth(0.4);
    doc.line(MARGIN, y, PAGE_W - MARGIN, y);
    nl(7);
  }

  function txt(
    str: string,
    size: number,
    color: readonly [number, number, number],
    bold = false,
    x = MARGIN
  ) {
    doc.setFontSize(size);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setTextColor(...color);
    const wrapped = doc.splitTextToSize(str, COL - (x - MARGIN));
    checkPage(size * 1.4 * wrapped.length);
    doc.text(wrapped, x, y);
    y += size * 1.4 * wrapped.length;
  }

  function sectionHead(label: string) {
    checkPage(28);
    nl(4);
    // Accent left bar
    doc.setFillColor(...C.accent);
    doc.rect(MARGIN, y - 10, 3, 14, "F");
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C.accent);
    doc.text(label.toUpperCase(), MARGIN + 8, y);
    y += 14;
    rule(C.rule);
  }

  function tableRow(
    cols: string[],
    widths: number[],
    color: readonly [number, number, number],
    bold = false,
    strip = false
  ) {
    checkPage(14);
    if (strip) {
      doc.setFillColor(...C.stripBg);
      doc.rect(MARGIN, y - 10, COL, 14, "F");
    }
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(8);
    doc.setTextColor(...color);
    let x = MARGIN + 4;
    cols.forEach((c, i) => {
      doc.text(c, x, y);
      x += widths[i];
    });
    y += 13;
  }

  /* ── Page 1 background ────────────────────────────────────────────────── */
  doc.setFillColor(...C.pageBg);
  doc.rect(0, 0, PAGE_W, PAGE_H, "F");

  /* ── Masthead ─────────────────────────────────────────────────────────── */
  // Navy header band
  doc.setFillColor(...C.accent);
  doc.rect(0, 0, PAGE_W, 64, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(...C.white);
  doc.text("ORION SPACE COMMAND", MARGIN, 28);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(180, 210, 240);
  doc.text("MISSION INTELLIGENCE BRIEFING  ·  CLASSIFICATION: RESTRICTED", MARGIN, 42);
  doc.text(`Generated: ${new Date().toUTCString()}  ·  OP-ID: ADMIN-01  ·  CLEARANCE: ALPHA`, MARGIN, 54);

  // Ref number far right
  const ref = `REF: OB-${Date.now().toString().slice(-8)}`;
  doc.text(ref, PAGE_W - MARGIN - doc.getTextWidth(ref), 54);

  y = 78;

  /* ═══════════════════════════════════════════════════════════════════════
   *  SECTION 1 — THREAT STATUS
   * ════════════════════════════════════════════════════════════════════════*/
  sectionHead("1. Threat Status");

  if (!result || result.intent === "error") {
    txt("No active mission data in current session.", 9, C.muted);
  } else {
    // Intent label
    txt(`Active Agent: ${result.intent.toUpperCase()}`, 8.5, C.accent, true);
    nl(4);

    // Extract the body text exactly once — no duplicate
    let body: string | null = null;
    if (result.intent === "forecaster" && "summary" in result) body = (result as ForecasterData).summary ?? null;
    else if (result.intent === "sentinel" && "summary" in result) body = (result as SentinelData).summary ?? null;
    else if (result.intent === "archivist" && "answer"  in result) body = (result as ArchivistData).answer  ?? null;

    if (body) txt(body, 8.5, C.body);

    // Live items summary
    nl(6);
    if (result.intent === "forecaster" && "items" in result) {
      const items = (result as ForecasterData).items ?? [];
      const xClass = items.filter(f => f.class_type?.toUpperCase().startsWith("X")).length;
      const mClass = items.filter(f => f.class_type?.toUpperCase().startsWith("M")).length;
      txt(`Flare events returned: ${items.length}  (X-class: ${xClass}  M-class: ${mClass})`, 8, C.muted);
    } else if (result.intent === "sentinel" && "items" in result) {
      const items = (result as SentinelData).items ?? [];
      const pho = items.filter(a => a.is_potentially_hazardous).length;
      txt(`NEO objects returned: ${items.length}  (PHO designated: ${pho})`, 8, C.muted);
    }
  }
  nl(4);

  /* ═══════════════════════════════════════════════════════════════════════
   *  SECTION 2 — SATELLITE INSURANCE & FINANCIAL RISK
   * ════════════════════════════════════════════════════════════════════════*/
  sectionHead("2. Satellite Insurance & Financial Risk Exposure");

  const RISK_W = [220, COL - 220];
  tableRow(["EVENT / TRIGGER", "ASSESSMENT"], RISK_W, C.accent, true, true);
  const risks = [
    ["Comm disruption (X-class flare)",          "HIGH — ~$50M/day industry exposure"],
    ["LEO collision probability (PHO pass)",       "ELEVATED — insurer watch status"],
    ["GPS signal degradation (M5+ flare)",         "MODERATE — aviation/maritime impact"],
    ["Radiation damage (SAA transit)",             "LOW — hardened shielding nominal"],
    ["Satellite drag anomaly (elevated F10.7)",    "MODERATE — orbit decay compensation cost"],
    ["HF/UHF spectrum congestion",                "LOW-MODERATE — backup link surcharges"],
  ];
  risks.forEach(([evt, asm], i) => {
    tableRow([evt, asm], RISK_W, C.body, false, i % 2 === 0);
  });
  nl(4);

  /* ═══════════════════════════════════════════════════════════════════════
   *  SECTION 3 — CONSTELLATION FLEET STATUS
   * ════════════════════════════════════════════════════════════════════════*/
  sectionHead("3. Constellation Fleet Status");

  const FW = [70, 130, 55, 65, COL - 320];
  tableRow(["ID", "NAME", "BAND", "BATTERY", "HEALTH"], FW, C.accent, true, true);
  FLEET.forEach((sat, i) => {
    const hColor: readonly [number,number,number] =
      sat.health === "OFFLINE"  ? C.red   :
      sat.health === "CRITICAL" ? C.red   :
      sat.health === "DEGRADED" ? C.amber : C.green;
    // Draw battery col in appropriate colour
    const strip = i % 2 === 0;
    checkPage(14);
    if (strip) { doc.setFillColor(...C.stripBg); doc.rect(MARGIN, y - 10, COL, 14, "F"); }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    let x = MARGIN + 4;
    const cols = [sat.id, sat.name, sat.band, `${sat.battery}%`, sat.health];
    cols.forEach((c, ci) => {
      const col = ci === 4 ? hColor : C.body;
      doc.setTextColor(...col);
      doc.setFont("helvetica", ci === 4 ? "bold" : "normal");
      doc.text(c, x, y);
      x += FW[ci];
    });
    y += 13;
  });

  const criticalCount = FLEET.filter(s => s.health === "CRITICAL" || s.health === "OFFLINE").length;
  nl(5);
  txt(`${FLEET.filter(s => s.health === "NOMINAL").length}/${FLEET.length} assets nominal  ·  ${criticalCount} asset(s) require immediate attention`, 8, C.muted);
  nl(4);

  /* ═══════════════════════════════════════════════════════════════════════
   *  SECTION 4 — ORBITAL THREAT MATRIX (DEBRIS & DRAG)
   * ════════════════════════════════════════════════════════════════════════*/
  sectionHead("4. Orbital Threat Matrix — Debris & Drag Analysis");

  // Get flare-driven drag modifier
  const forecasterData = result?.intent === "forecaster" ? (result as ForecasterData) : null;
  const { dragBoost, collDelta, worstClass } = dragFromFlare(forecasterData);

  if (dragBoost > 0) {
    txt(`Solar input: Class ${worstClass} active — thermospheric drag elevated +${dragBoost}%, collision Pc +${collDelta}%`, 8.5, C.red, true);
    nl(4);
  } else {
    txt("Solar input: Quiet — baseline thermospheric density nominal", 8.5, C.green, true);
    nl(4);
  }

  const DW = [80, 55, 80, 90, COL - 305];
  tableRow(["ASSET", "ALT (km)", "Pc (%)", "DRAG (m/s²)", "STATUS"], DW, C.accent, true, true);
  LEO_ASSETS.forEach((a, i) => {
    const collProb = Math.min(99, (a.baseCollProb + collDelta / 100) * 100);
    const drag     = +(a.baseDrag * (1 + dragBoost / 100)).toFixed(2);
    const status   = collProb > 8 ? "ELEVATED" : collProb > 4 ? "WATCH" : "NOMINAL";
    const sColor: readonly [number,number,number] = collProb > 8 ? C.red : collProb > 4 ? C.amber : C.green;
    checkPage(14);
    if (i % 2 === 0) { doc.setFillColor(...C.stripBg); doc.rect(MARGIN, y - 10, COL, 14, "F"); }
    doc.setFontSize(8);
    let x = MARGIN + 4;
    const vals = [a.id, `${a.alt}`, collProb.toFixed(2), `${drag}×10⁻⁷`, status];
    vals.forEach((v, vi) => {
      doc.setTextColor(...(vi === 4 ? sColor : C.body));
      doc.setFont("helvetica", vi === 4 ? "bold" : "normal");
      doc.text(v, x, y);
      x += DW[vi];
    });
    y += 13;
  });
  nl(4);

  /* ═══════════════════════════════════════════════════════════════════════
   *  SECTION 5 — HARDWARE MITIGATION PROTOCOLS
   * ════════════════════════════════════════════════════════════════════════*/
  sectionHead("5. Hardware Mitigation Protocols");

  txt("The following measures are recommended based on current threat posture:", 8.5, C.body);
  nl(5);
  MITIGATIONS.forEach((m, i) => {
    checkPage(14);
    txt(`${i + 1}.  ${m}`, 8.5, C.body, false, MARGIN + 4);
    nl(2);
  });
  nl(4);

  /* ═══════════════════════════════════════════════════════════════════════
   *  SECTION 6 — TELEMETRY LOG SNAPSHOT
   * ════════════════════════════════════════════════════════════════════════*/
  sectionHead("6. Telemetry Log Snapshot");

  const last14 = logs.slice(-14);
  if (last14.length === 0) {
    txt("No telemetry recorded in current session.", 8.5, C.muted);
  } else {
    const LW = [72, 45, COL - 117];
    tableRow(["TIMESTAMP", "LEVEL", "MESSAGE"], LW, C.accent, true, true);
    last14.forEach((l, i) => {
      const lc: readonly [number,number,number] =
        l.level === "WARN"  ? C.red   :
        l.level === "OK"    ? C.green :
        l.level === "ROUTE" ? C.accent : C.muted;
      checkPage(14);
      if (i % 2 === 0) { doc.setFillColor(...C.stripBg); doc.rect(MARGIN, y - 10, COL, 14, "F"); }
      doc.setFontSize(7.5);
      let x = MARGIN + 4;
      const row = [l.ts, l.level, l.msg];
      row.forEach((v, vi) => {
        doc.setTextColor(...(vi === 1 ? lc : C.body));
        doc.setFont("helvetica", vi === 1 ? "bold" : "normal");
        const clipped = doc.splitTextToSize(v, LW[vi] - 4)[0];
        doc.text(clipped, x, y);
        x += LW[vi];
      });
      y += 13;
    });
  }
  nl(6);

  /* ── Footer on every page ─────────────────────────────────────────────── */
  const totalPages = (doc as unknown as { internal: { getNumberOfPages: () => number } }).internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFillColor(...C.accent);
    doc.rect(0, PAGE_H - 22, PAGE_W, 22, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...C.white);
    doc.text("ORION Space Command · Powered by IBM watsonx · RESTRICTED — NOT FOR PUBLIC RELEASE", MARGIN, PAGE_H - 8);
    const pg = `Page ${p} of ${totalPages}`;
    doc.text(pg, PAGE_W - MARGIN - doc.getTextWidth(pg), PAGE_H - 8);
  }

  doc.save(`orion-briefing-${Date.now()}.pdf`);
}
