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
  query: string
): Promise<string> {
  const res = await fetch(`${langflowUrl}/api/v1/run/${flowId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
    if (!langflowUrl || !routerFlowId) {
      return NextResponse.json(
        { intent: "error", error: "LANGFLOW_URL or LANGFLOW_FLOW_ID not configured", items: [], summary: "" },
        { status: 500 }
      );
    }

    // Phase 1: classify intent
    const routerText = await callFlow(langflowUrl, routerFlowId, query.trim());
    const routerJson = JSON.parse(stripFences(routerText)) as { intent: string; query: string };
    const intent = routerJson.intent?.toLowerCase();
    const subQuery = routerJson.query ?? query.trim();

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

    const agentText = await callFlow(langflowUrl, subFlowId, subQuery);
    const agentData = JSON.parse(stripFences(agentText)) as Record<string, unknown>;

    return NextResponse.json({ intent, ...agentData }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { intent: "error", error: message, items: [], summary: "" },
      { status: 500 }
    );
  }
}
