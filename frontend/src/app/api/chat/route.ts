import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function stripFences(text: string): string {
  return text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

/** Attempt to close a truncated JSON string so partial results can still render. */
function repairJson(s: string): string {
  // Remove any trailing incomplete key/value (e.g. `,"key":` or `,"key":"val`)
  let t = s.replace(/,\s*"[^"]*"?\s*:\s*"?[^",}\]]*$/, "");

  // Close any open string
  const openStrings = (t.match(/(?<!\\)"/g) ?? []).length % 2;
  if (openStrings) t += '"';

  // Count unclosed brackets/braces and close them in reverse order
  const stack: string[] = [];
  const pairs: Record<string, string> = { "{": "}", "[": "]" };
  const closing = new Set(["}", "]"]);
  for (const ch of t) {
    if (ch === "{" || ch === "[") stack.push(pairs[ch]);
    else if (closing.has(ch)) stack.pop();
  }
  t += stack.reverse().join("");
  return t;
}

function safeParseJson(text: string, label: string): Record<string, unknown> {
  const cleaned = stripFences(text);
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    // Try to repair truncated JSON before giving up
    try {
      const repaired = repairJson(cleaned);
      const parsed = JSON.parse(repaired) as Record<string, unknown>;
      // Tag so the UI can optionally warn about partial data
      (parsed as Record<string, unknown>)._truncated = true;
      return parsed;
    } catch {
      throw new Error(
        `${label} returned invalid JSON (truncated at ${cleaned.length} chars). Raw: ${cleaned.slice(0, 300)}…`
      );
    }
  }
}

function parseLangflowText(body: unknown): string {
  const b = body as Record<string, unknown>;
  const outputs = b?.outputs as unknown[];
  const first = outputs?.[0] as Record<string, unknown>;
  const inner = (first?.outputs as unknown[])?.[0] as Record<string, unknown>;
  const results = inner?.results as Record<string, unknown>;
  const message = results?.message as Record<string, unknown>;
  const text = message?.text;
  if (typeof text !== "string") {
    throw new Error("Unexpected Langflow response shape");
  }
  return text;
}

async function callFlow(
  langflowUrl: string,
  flowId: string,
  query: string,
  apiKey?: string
): Promise<string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["x-api-key"] = apiKey;

  const res = await fetch(`${langflowUrl}/api/v1/run/${flowId}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ input_value: query }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Langflow returned ${res.status}: ${errText}`);
  }
  const body: unknown = await res.json();
  return parseLangflowText(body);
}

export async function POST(req: NextRequest) {
  try {
    const body: unknown = await req.json();
    const query = (body as Record<string, unknown>)?.query;
    if (typeof query !== "string" || query.trim() === "") {
      return NextResponse.json(
        { intent: "error", error: "Missing or empty query", items: [], summary: "" },
        { status: 400 }
      );
    }

    const langflowUrl = process.env.LANGFLOW_URL;
    const routerFlowId = process.env.LANGFLOW_FLOW_ID;
    const langflowApiKey = process.env.LANGFLOW_API_KEY; // optional — set if Langflow auth is enabled
    if (!langflowUrl || !routerFlowId) {
      return NextResponse.json(
        { intent: "error", error: "LANGFLOW_URL or LANGFLOW_FLOW_ID not configured", items: [], summary: "" },
        { status: 500 }
      );
    }

    // Phase 1: classify intent
    const routerText = await callFlow(langflowUrl, routerFlowId, query.trim(), langflowApiKey);
    const routerJson = safeParseJson(routerText, "Router flow") as { intent: string; query: string };
    const intent = routerJson.intent?.toLowerCase();
    const subQuery = (routerJson.query as string) ?? query.trim();

    // Phase 2: call sub-agent
    const flowIdMap: Record<string, string | undefined> = {
      sentinel: process.env.SENTINEL_FLOW_ID,
      forecaster: process.env.FORECASTER_FLOW_ID,
      archivist: process.env.ARCHIVIST_FLOW_ID,
    };

    const subFlowId = flowIdMap[intent];
    if (!subFlowId) {
      return NextResponse.json(
        {
          intent: "error",
          error: `No flow ID configured for intent "${intent}". Set ${intent.toUpperCase()}_FLOW_ID in .env.local.`,
          items: [],
          summary: "",
        },
        { status: 500 }
      );
    }

    const agentText = await callFlow(langflowUrl, subFlowId, subQuery, langflowApiKey);
    const agentData = safeParseJson(agentText, `${intent} agent flow`);

    return NextResponse.json({ intent, ...agentData }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { intent: "error", error: message, items: [], summary: "" },
      { status: 500 }
    );
  }
}
