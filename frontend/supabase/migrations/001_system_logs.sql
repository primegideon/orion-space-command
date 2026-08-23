-- ─────────────────────────────────────────────────────────────────────────────
-- ORION Space Command — system_logs table
-- Run once against your Supabase project via the SQL editor or CLI.
-- ─────────────────────────────────────────────────────────────────────────────

-- Main log table
CREATE TABLE IF NOT EXISTS public.system_logs (
  id             bigserial     PRIMARY KEY,
  created_at     timestamptz   NOT NULL DEFAULT now(),
  query_string   text          NOT NULL,
  resolved_agent text          NOT NULL CHECK (resolved_agent IN ('sentinel','forecaster','archivist','error')),
  latency_ms     integer       NOT NULL DEFAULT 0,
  token_usage    integer       NOT NULL DEFAULT 0,
  status         text          NOT NULL DEFAULT 'OK' CHECK (status IN ('OK','WARN','ERROR')),
  error_message  text
);

-- Index for the common query patterns used by the Mission Log UI
CREATE INDEX IF NOT EXISTS idx_system_logs_created_at
  ON public.system_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_logs_agent
  ON public.system_logs (resolved_agent);

-- Row-Level Security: service-role key has full access; anon has no access.
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

-- Allow the service role (used by the Next.js backend) to do everything
CREATE POLICY "service_role_full_access"
  ON public.system_logs
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
