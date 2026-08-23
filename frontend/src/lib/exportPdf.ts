"use client";

import type { ForecasterData } from "@/components/ForecasterPanel";
import type { SentinelData, AsteroidItem } from "@/components/SentinelPanel";
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
  accent:   [0,   90,  160] as const,
  red:      [190, 30,  40]  as const,
  amber:    [160, 100, 0]   as const,
  green:    [20,  130, 80]  as const,
  white:    [255, 255, 255] as const,
  pageBg:   [250, 251, 252] as const,
  stripBg:  [240, 243, 248] as const,
};

/* ── LLM output sanitizer ─────────────────────────────────────────────────
 * Strips prompt-injection artifacts, chain-of-thought leakage, and
 * rewrite/editing markers that watsonx occasionally emits.
 * ─────────────────────────────────────────────────────────────────────── */
function sanitizeLlmOutput(raw: string): string {
  // If the LLM repeated itself with an edit marker, keep only the final version
  // e.g. "paragraph A. is rewritten to:\nparagraph A again." → keep second half
  const editMarkers = [
    /\bis\s+rewritten\s+to\s*:?\s*/i,
    /\bhas\s+been\s+rewritten\s+as\s*:?\s*/i,
    /\brevised\s+version\s*:?\s*/i,
    /\bupdated\s+paragraph\s*:?\s*/i,
    /\bhere\s+is\s+the\s+rewritten[^:\n]*:?\s*/i,
    /\bhere'?s?\s+the\s+(?:rewritten|updated|revised)[^:\n]*:?\s*/i,
  ];
  let text = raw;
  for (const marker of editMarkers) {
    const parts = text.split(marker);
    if (parts.length > 1) {
      // Take the last part — it's the final rewrite
      text = parts[parts.length - 1];
    }
  }

  text = text
    // Strip "Here is the rewritten..." / "Here's the updated..." preambles
    .replace(/^here'?s?\s+(is\s+)?(the\s+)?(rewritten|updated|revised|corrected|improved)[^:\n]*:?\s*/gim, "")
    // Strip "Note:", "Editor's note:", "Prompt:", "Output:" prefixes
    .replace(/^(note|editor'?s?\s+note|prompt|output|result|response)\s*:\s*/gim, "")
    // Strip markdown code fences
    .replace(/```[\s\S]*?```/g, "")
    // Strip inline backticks
    .replace(/`[^`]*`/g, "")
    // Strip markdown headings
    .replace(/^#{1,6}\s+.*/gm, "")
    // Strip chain-of-thought step markers
    .replace(/^(step\s*\d+[:\-.]?.*|thinking[:\-.]?.*|reasoning[:\-.]?.*)/gim, "")
    // Strip bold/italic markers
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1")
    // Strip leading/trailing quotes that wrap the whole output
    .replace(/^["']|["']$/g, "")
    // Collapse multiple blank lines
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // De-duplicate: if the model repeated itself without any marker,
  // and the second half of the text is ≥60% the same words as the first half,
  // keep only the first half.
  const sentences = text.split(/(?<=[.!?])\s+/);
  if (sentences.length >= 6) {
    const half = Math.floor(sentences.length / 2);
    const firstHalf  = sentences.slice(0, half).join(" ").toLowerCase();
    const secondHalf = sentences.slice(sentences.length - half).join(" ").toLowerCase();
    const firstWords  = new Set(firstHalf.split(/\W+/).filter(Boolean));
    const secondWords = secondHalf.split(/\W+/).filter(Boolean);
    const overlap = secondWords.filter(w => firstWords.has(w)).length;
    if (overlap / firstWords.size > 0.6) {
      text = sentences.slice(0, half).join(" ").trim();
    }
  }

  return text;
}

/* ── Flare-driven drag modifier ───────────────────────────────────────────*/
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
  const collDelta = worstScore >= 1000 ? 12 : worstScore >= 500 ? 8  : worstScore >= 100 ? 4  : worstScore >= 10 ? 1 : 0;
  return { dragBoost, collDelta, worstClass };
}

/* ── Hardware mitigation recommendations ──────────────────────────────────*/
const MITIGATIONS = [
  "Orient solar arrays to low-drag profile during elevated thermospheric density.",
  "Enable safe-mode RCS hold on CRITICAL/OFFLINE assets until battery SoC > 30%.",
  "Switch comm links to X-band or Ka-band during UHF congestion events.",
  "Activate secondary radiation shielding on SAA-crossing LEO assets (X/M5+ flare).",
  "Engage GPS correction algorithms during R2+ HF blackout windows.",
  "Defer non-critical manoeuvres within 48 h of PHO close-approach window.",
];

/* ── Live data fetchers ────────────────────────────────────────────────────*/

interface KpReading { time_tag: string; kp: number; }
interface KpPayload { current: KpReading; history: KpReading[]; status: string; }

async function fetchKp(): Promise<KpPayload | null> {
  try {
    const res = await fetch("/api/kp", { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json() as KpPayload;
  } catch { return null; }
}

interface SatelliteRow { norad: number; name: string; orbit: string; status: string; }

async function fetchSatellites(): Promise<SatelliteRow[]> {
  try {
    const res = await fetch("/api/satellites", { cache: "no-store" });
    // Always parse the body — our route returns { satellites: [] } even on 502
    const payload = await res.json() as { satellites?: unknown[] };
    const data = Array.isArray(payload) ? payload : (payload.satellites ?? []);
    if (!Array.isArray(data) || data.length === 0) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data as any[]).slice(0, 12).map((s) => ({
      norad:  s.norad_id ?? s.norad_cat_id ?? 0,
      name:   (s.name ?? s.object_name ?? "UNKNOWN").slice(0, 24),
      orbit:  s.band ?? s.orbit_type ?? "LEO",
      status: s.health ?? s.operational_status ?? "NOMINAL",
    }));
  } catch { return []; }
}

/* ── Main export function ─────────────────────────────────────────────────*/
export async function exportBriefing(
  result: AgentResult,
  logs: TelemetryLog[],
  lastForecaster: ForecasterData | null = null,
  lastSentinel: SentinelData | null = null,
) {
  // Fetch live Kp and satellite data in parallel while jsPDF loads
  const [{ default: jsPDF }, kpData, satellites] = await Promise.all([
    import("jspdf"),
    fetchKp(),
    fetchSatellites(),
  ]);

  // Resolve best available forecaster and sentinel data
  const forecasterData: ForecasterData | null =
    result?.intent === "forecaster" ? (result as ForecasterData) : lastForecaster;
  const sentinelData: SentinelData | null =
    result?.intent === "sentinel"   ? (result as SentinelData)   : lastSentinel;

  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
  const PAGE_W = doc.internal.pageSize.getWidth();
  const PAGE_H = doc.internal.pageSize.getHeight();
  const MARGIN = 44;
  const COL = PAGE_W - MARGIN * 2;
  let y = MARGIN;

  /* ── Helpers ──────────────────────────────────────────────────────────── */
  function checkPage(needed = 40) {
    if (y + needed > PAGE_H - MARGIN) {
      doc.addPage();
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
    x = MARGIN,
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
    strip = false,
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

  /* ── Page 1 background ───────────────────────────────────────────────── */
  doc.setFillColor(...C.pageBg);
  doc.rect(0, 0, PAGE_W, PAGE_H, "F");

  /* ── Masthead ────────────────────────────────────────────────────────── */
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

  // Fix 1: replace hardcoded OP-ID with SYSTEM-AUTO
  doc.text(`Generated: ${new Date().toUTCString()}  ·  OPERATOR: SYSTEM-AUTO`, MARGIN, 54);

  const ref = `REF: OB-${Date.now().toString().slice(-8)}`;
  doc.text(ref, PAGE_W - MARGIN - doc.getTextWidth(ref), 54);

  y = 78;

  /* ═══════════════════════════════════════════════════════════════════════
   *  SECTION 1 — THREAT STATUS
   * ══════════════════════════════════════════════════════════════════════*/
  sectionHead("1. Threat Status");

  if (!result || result.intent === "error") {
    txt("No active mission data in current session.", 9, C.muted);
  } else {
    txt(`Active Agent: ${result.intent.toUpperCase()}`, 8.5, C.accent, true);
    nl(4);

    let body: string | null = null;
    if (result.intent === "forecaster" && "summary" in result) body = (result as ForecasterData).summary ?? null;
    else if (result.intent === "sentinel" && "summary" in result) body = (result as SentinelData).summary ?? null;
    else if (result.intent === "archivist" && "answer" in result)  body = (result as ArchivistData).answer  ?? null;

    // Fix 2: sanitize LLM output before injecting into PDF
    if (body) txt(sanitizeLlmOutput(body), 8.5, C.body);

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
   * ══════════════════════════════════════════════════════════════════════*/
  sectionHead("2. Satellite Insurance & Financial Risk Exposure");

  const RISK_W = [220, COL - 220];
  tableRow(["EVENT / TRIGGER", "ASSESSMENT"], RISK_W, C.accent, true, true);
  const risks = [
    ["Comm disruption (X-class flare)",       "HIGH — ~$50M/day industry exposure"],
    ["LEO collision probability (PHO pass)",   "ELEVATED — insurer watch status"],
    ["GPS signal degradation (M5+ flare)",     "MODERATE — aviation/maritime impact"],
    ["Radiation damage (SAA transit)",         "LOW — hardened shielding nominal"],
    ["Satellite drag anomaly (elevated F10.7)","MODERATE — orbit decay compensation cost"],
    ["HF/UHF spectrum congestion",            "LOW-MODERATE — backup link surcharges"],
  ];
  risks.forEach(([evt, asm], i) => {
    tableRow([evt, asm], RISK_W, C.body, false, i % 2 === 0);
  });
  nl(4);

  /* ═══════════════════════════════════════════════════════════════════════
   *  SECTION 3 — CONSTELLATION FLEET STATUS
   *  Fix 3: uses live /api/satellites data; falls back to note if unavailable
   * ══════════════════════════════════════════════════════════════════════*/
  sectionHead("3. Constellation Fleet Status");

  if (satellites.length > 0) {
    const FW = [65, 165, 60, COL - 290];
    tableRow(["NORAD ID", "NAME", "ORBIT", "STATUS"], FW, C.accent, true, true);
    satellites.forEach((sat, i) => {
      const isActive = sat.status === "ACTIVE" || sat.status === "+";
      const sColor: readonly [number, number, number] = isActive ? C.green : C.amber;
      const strip = i % 2 === 0;
      checkPage(14);
      if (strip) { doc.setFillColor(...C.stripBg); doc.rect(MARGIN, y - 10, COL, 14, "F"); }
      doc.setFontSize(8);
      let x = MARGIN + 4;
      const cols = [String(sat.norad), sat.name, sat.orbit, sat.status];
      cols.forEach((c, ci) => {
        doc.setTextColor(...(ci === 3 ? sColor : C.body));
        doc.setFont("helvetica", ci === 3 ? "bold" : "normal");
        doc.text(c, x, y);
        x += FW[ci];
      });
      y += 13;
    });
    nl(5);
    txt(`${satellites.length} satellites from live feed  ·  Source: /api/satellites`, 8, C.muted);
  } else {
    txt("Live satellite feed unavailable at export time.", 8.5, C.muted);
  }
  nl(4);

  /* ═══════════════════════════════════════════════════════════════════════
   *  SECTION 4 — ORBITAL THREAT MATRIX
   *  Fix 4: uses real PHO data from lastSentinel + live Kp from /api/kp
   * ══════════════════════════════════════════════════════════════════════*/
  sectionHead("4. Orbital Threat Matrix — Near-Earth Objects & Geomagnetic Activity");

  // Kp sub-section
  if (kpData) {
    const kp = kpData.current.kp;
    const kpColor: readonly [number, number, number] =
      kp >= 7 ? C.red : kp >= 5 ? C.red : kp >= 4 ? C.amber : C.green;
    txt(
      `Live Kp-Index: ${kp.toFixed(2)}  ·  Status: ${kpData.status}  ·  Source: NOAA SWPC`,
      8.5, kpColor, true,
    );
    nl(4);
    if (kp >= 5) {
      txt("⚠ Geomagnetic storm in progress — elevated satellite drag, GPS degradation possible.", 8, C.red);
      nl(4);
    }
  } else {
    txt("Kp-Index: unavailable at export time.", 8.5, C.muted);
    nl(4);
  }

  // Flare drag modifier from real forecaster data
  const { dragBoost, collDelta, worstClass } = dragFromFlare(forecasterData);
  if (dragBoost > 0) {
    txt(`Solar input: Class ${worstClass} — thermospheric drag elevated +${dragBoost}%, collision Pc +${collDelta}%`, 8.5, C.red, true);
  } else {
    txt("Solar input: Quiet — baseline thermospheric density nominal.", 8.5, C.green, true);
  }
  nl(6);

  // PHO table from real sentinel data
  const phoItems: AsteroidItem[] = (sentinelData?.items ?? []).filter(a => a.is_potentially_hazardous).slice(0, 10);
  const allNeos: AsteroidItem[]  = (sentinelData?.items ?? []).slice(0, 10);
  const neoRows = phoItems.length > 0 ? phoItems : allNeos;

  if (neoRows.length > 0) {
    const NW = [160, 90, 90, COL - 340];
    tableRow(["NAME", "MISS DIST (km)", "APPROACH DATE", "HAZARDOUS"], NW, C.accent, true, true);
    neoRows.forEach((neo, i) => {
      const dist = neo.miss_distance_km != null
        ? Math.round(neo.miss_distance_km).toLocaleString()
        : "—";
      const date = neo.close_approach_date ?? "—";
      const hazard = neo.is_potentially_hazardous ? "YES" : "NO";
      const hColor: readonly [number, number, number] = neo.is_potentially_hazardous ? C.red : C.green;
      checkPage(14);
      if (i % 2 === 0) { doc.setFillColor(...C.stripBg); doc.rect(MARGIN, y - 10, COL, 14, "F"); }
      doc.setFontSize(8);
      let x = MARGIN + 4;
      const cols = [neo.name.slice(0, 28), dist, date, hazard];
      cols.forEach((c, ci) => {
        doc.setTextColor(...(ci === 3 ? hColor : C.body));
        doc.setFont("helvetica", ci === 3 ? "bold" : "normal");
        doc.text(c, x, y);
        x += NW[ci];
      });
      y += 13;
    });
    nl(5);
    const src = phoItems.length > 0
      ? `${phoItems.length} PHO(s) from live NASA NeoWs feed`
      : `${neoRows.length} NEO(s) from live NASA NeoWs feed — no PHOs in current window`;
    txt(src, 8, C.muted);
  } else {
    txt("No NEO data available — query Sentinel before exporting.", 8.5, C.muted);
  }
  nl(4);

  /* ═══════════════════════════════════════════════════════════════════════
   *  SECTION 5 — HARDWARE MITIGATION PROTOCOLS
   * ══════════════════════════════════════════════════════════════════════*/
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
   * ══════════════════════════════════════════════════════════════════════*/
  sectionHead("6. Telemetry Log Snapshot");

  const last14 = logs.slice(-14);
  if (last14.length === 0) {
    txt("No telemetry recorded in current session.", 8.5, C.muted);
  } else {
    const LW = [72, 45, COL - 117];
    tableRow(["TIMESTAMP", "LEVEL", "MESSAGE"], LW, C.accent, true, true);
    last14.forEach((l, i) => {
      const lc: readonly [number, number, number] =
        l.level === "WARN"  ? C.red    :
        l.level === "OK"    ? C.green  :
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

  /* ── Footer on every page ────────────────────────────────────────────── */
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
