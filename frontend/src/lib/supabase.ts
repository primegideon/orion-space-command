/**
 * Supabase server-side client — server components and API routes only.
 * Uses the service-role key so it bypasses RLS.
 * Never import this in client components.
 */
import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase is not configured — set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  _client = createClient(url, key, {
    auth: { persistSession: false },
  });

  return _client;
}

/* ── system_logs helpers ───────────────────────────────────────────────────*/

export interface SystemLogRow {
  id:             number;
  created_at:     string;    // ISO timestamptz
  query_string:   string;
  resolved_agent: "sentinel" | "forecaster" | "archivist" | "error";
  latency_ms:     number;
  token_usage:    number;
  status:         "OK" | "WARN" | "ERROR";
  error_message:  string | null;
}

export interface InsertLogParams {
  query_string:   string;
  resolved_agent: SystemLogRow["resolved_agent"];
  latency_ms:     number;
  token_usage?:   number;
  status?:        SystemLogRow["status"];
  error_message?: string | null;
}

/**
 * Write one row to system_logs.
 * Fire-and-forget safe — errors are caught and logged to stderr only,
 * so a Supabase failure never breaks the user-facing API response.
 */
export async function insertLog(params: InsertLogParams): Promise<void> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      console.error("[system_logs] insert skipped — SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL not set");
      return;
    }
    const sb = getSupabaseAdmin();
    const { error } = await sb.from("system_logs").insert({
      query_string:   params.query_string,
      resolved_agent: params.resolved_agent,
      latency_ms:     params.latency_ms,
      token_usage:    params.token_usage ?? 0,
      status:         params.status ?? "OK",
      error_message:  params.error_message ?? null,
    });
    if (error) {
      console.error("[system_logs] insert error:", error.message);
    }
  } catch (err) {
    console.error("[system_logs] unexpected error:", err);
  }
}
