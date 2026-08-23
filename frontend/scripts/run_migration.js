/**
 * Bootstrap system_logs via a CREATE FUNCTION + RPC call.
 * Supabase PostgREST doesn't allow direct DDL, but it DOES allow
 * calling existing Postgres functions. The trick:
 *
 *   1. Use the Supabase REST API's DDL endpoint to create a helper function
 *      (POST /rest/v1/ with Content-Type: application/sql isn't supported)
 *
 * The ONLY reliable way without a PAT is the "function wrapper" pattern:
 *   a. POST to /rest/v1/rpc/run_sql (create this function first)
 *   → but we can't create it without DDL access... chicken-and-egg.
 *
 * SOLUTION: Supabase provides a special DDL endpoint for service_role:
 *   https://supabase.com/docs/reference/api/v0#tag/query/POST/v1/projects/{ref}/database/query
 *   This requires the SUPABASE_ACCESS_TOKEN (PAT), not the service role key.
 *
 * Since we don't have a PAT here, we use the NEXT BEST approach:
 * Create the table via the Supabase JS client's `.sql()` method (v2.x SDK)
 * which is available from supabase-js >= 2.45.0
 */

const SUPABASE_URL = "https://wpyhareaqlsrukapwqaw.supabase.co";
const SERVICE_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndweWhhcmVhcWxzcnVrYXB3cWF3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzIyNDI1NCwiZXhwIjoyMTAyODAwMjV9.GAi9DwSQ1bQWnkXNf0h66JlllaXH9CmLPQzelElv4Yo";

async function main() {
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // Check SDK version for .sql() support
  console.log("Supabase SDK version check...");

  // Try the .sql() tagged template (supabase-js >= 2.45)
  if (typeof sb.rpc === "function") {
    // Use a known approach: POST raw SQL wrapped in a function we create on-the-fly.
    // First, try to create the bootstrap function using the REST API's
    // "application/vnd.pgrst.object+json" content-type (doesn't work for DDL).
    // 
    // Actually the correct endpoint for Supabase cloud DDL without PAT is:
    //   POST https://<ref>.supabase.co/rest/v1/rpc/_exec (created by supabase CLI)
    // OR we can use the pg websocket endpoint on newer Supabase.
    //
    // The ACTUAL solution: POST to /rest/v1/ with the SQL as body and
    // Content-Type: "application/sql" (supported in PostgREST 12+, which Supabase uses)

    const sqlEndpoint = `${SUPABASE_URL}/rest/v1/`;
    const headers = {
      "apikey":          SERVICE_KEY,
      "Authorization":   `Bearer ${SERVICE_KEY}`,
      "Content-Type":    "application/sql",
      "Accept":          "application/json",
    };

    const ddl = `
      CREATE TABLE IF NOT EXISTS public.system_logs (
        id             bigserial     PRIMARY KEY,
        created_at     timestamptz   NOT NULL DEFAULT now(),
        query_string   text          NOT NULL DEFAULT '',
        resolved_agent text          NOT NULL DEFAULT 'error'
                                     CHECK (resolved_agent IN ('sentinel','forecaster','archivist','error')),
        latency_ms     integer       NOT NULL DEFAULT 0,
        token_usage    integer       NOT NULL DEFAULT 0,
        status         text          NOT NULL DEFAULT 'OK'
                                     CHECK (status IN ('OK','WARN','ERROR')),
        error_message  text
      );
      CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON public.system_logs (created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_system_logs_agent ON public.system_logs (resolved_agent);
      ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;
    `;

    const res = await fetch(sqlEndpoint, {
      method: "POST",
      headers,
      body: ddl,
    });
    const body = await res.text();
    console.log("application/sql endpoint:", res.status, body.slice(0, 300));

    if (res.status === 200 || res.status === 201) {
      console.log("✓ Table created!");
      return;
    }

    // Last resort: try supabase-js .sql() if it exists on this SDK version
    // @ts-ignore
    if (typeof sb.sql === "function") {
      try {
        // @ts-ignore
        const result = await sb.sql`
          CREATE TABLE IF NOT EXISTS public.system_logs (
            id             bigserial     PRIMARY KEY,
            created_at     timestamptz   NOT NULL DEFAULT now(),
            query_string   text          NOT NULL DEFAULT '',
            resolved_agent text          NOT NULL DEFAULT 'error',
            latency_ms     integer       NOT NULL DEFAULT 0,
            token_usage    integer       NOT NULL DEFAULT 0,
            status         text          NOT NULL DEFAULT 'OK',
            error_message  text
          );
        `;
        console.log("sb.sql() result:", result);
        return;
      } catch (e) {
        console.log("sb.sql() not available:", e.message);
      }
    }

    console.log("\n─────────────────────────────────────────────────");
    console.log("MANUAL STEP REQUIRED: The Supabase service role key");
    console.log("cannot run DDL without a Personal Access Token (PAT).");
    console.log("Please run the following SQL in your Supabase SQL Editor:");
    console.log("https://supabase.com/dashboard/project/wpyhareaqlsrukapwqaw/sql/new");
    console.log("─────────────────────────────────────────────────\n");
    console.log(ddl);
  }
}

main().catch(console.error);
