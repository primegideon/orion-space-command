/**
 * GET /api/logs — Fetch system_logs from Supabase
 *
 * Query params:
 *   limit  — max rows to return (default 100, max 500)
 *   offset — pagination offset (default 0)
 *   agent  — filter by resolved_agent ("sentinel"|"forecaster"|"archivist"|"error")
 *
 * Returns rows newest-first plus aggregate stats computed in JS
 * so the client component needs no extra round-trips.
 */
import { NextRequest, NextResponse } from "next/server";
import type { SystemLogRow } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface LogsStats {
  total_queries: number;   // full table count (not limited to current window)
  avg_latency_ms: number;
  total_tokens: number;
  error_count: number;
  warn_count: number;
}

export interface LogsResponse {
  rows: SystemLogRow[];
  stats: LogsStats;
  fetched_at: string;
}

/** Empty payload factory — called fresh each time so fetched_at is current */
function makeEmpty(): LogsResponse & { setup_required: boolean } {
  return {
    rows:  [],
    stats: { total_queries: 0, avg_latency_ms: 0, total_tokens: 0, error_count: 0, warn_count: 0 },
    fetched_at:    new Date().toISOString(),
    setup_required: true,
  };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit  = Math.min(500, Math.max(1, parseInt(searchParams.get("limit")  ?? "100", 10)));
    const offset =                            Math.max(0, parseInt(searchParams.get("offset") ?? "0",   10));
    const agent  = searchParams.get("agent") ?? null;

    // Always create a fresh client — never use module-level singleton for reads
    // so we don't serve stale data from a cached Supabase client instance
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return NextResponse.json(makeEmpty());
    }

    // Import inline to guarantee a fresh client every request in dev hot-reload
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(url, key, { auth: { persistSession: false } });

    // Single query — fetch all rows with exact count in one round-trip.
    // Using count:"exact" on the data query avoids separate count queries
    // hitting different pooled connections and seeing stale results.
    let rowQuery = sb
      .from("system_logs")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (agent && ["sentinel", "forecaster", "archivist", "error"].includes(agent)) {
      rowQuery = rowQuery.eq("resolved_agent", agent);
    }

    const { data, error, count: totalCount } = await rowQuery;

    if (error) {
      const isTableMissing =
        error.code === "PGRST200" ||
        error.code === "PGRST205" ||
        error.message?.includes("relation") ||
        error.message?.includes("does not exist") ||
        error.message?.includes("schema cache");

      if (isTableMissing) {
        return NextResponse.json(makeEmpty());
      }
      console.error("[/api/logs] Supabase error:", error.code, error.message);
      throw new Error(`Supabase query error: ${error.message}`);
    }

    const rows = (data ?? []) as SystemLogRow[];

    // total_queries from the same query's count — always consistent with rows
    const total_queries  = totalCount ?? rows.length;
    const error_count    = rows.filter(r => r.status === "ERROR").length;
    const warn_count     = rows.filter(r => r.status === "WARN").length;
    const avg_latency_ms = rows.length > 0
      ? Math.round(rows.reduce((s, r) => s + r.latency_ms, 0) / rows.length)
      : 0;
    const total_tokens   = rows.reduce((s, r) => s + r.token_usage, 0);

    const payload: LogsResponse = {
      rows,
      stats: { total_queries, avg_latency_ms, total_tokens, error_count, warn_count },
      fetched_at: new Date().toISOString(),
    };

    return NextResponse.json(payload);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
