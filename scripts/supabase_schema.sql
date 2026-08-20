-- ============================================================
-- ORION V2 — Supabase pgvector schema
-- Run this in the Supabase SQL editor:
--   https://supabase.com/dashboard → your project → SQL Editor
-- ============================================================

-- 1. Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Research embeddings table (replaces local Chroma DB)
CREATE TABLE IF NOT EXISTS research_embeddings (
  id          BIGSERIAL PRIMARY KEY,
  source      TEXT    NOT NULL,       -- e.g. "solar_flare_forecasting_ml (arXiv:2209.00789)"
  chunk_index INTEGER NOT NULL,       -- position within source document
  content     TEXT    NOT NULL,       -- raw 512-char chunk text
  embedding   VECTOR(384) NOT NULL,   -- all-MiniLM-L6-v2 / slate-30m → 384 dimensions
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 3. HNSW index for fast cosine similarity search
CREATE INDEX IF NOT EXISTS research_embeddings_embedding_idx
  ON research_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 4. Telemetry logs (optional — query history)
CREATE TABLE IF NOT EXISTS telemetry_logs (
  id         BIGSERIAL PRIMARY KEY,
  session_id UUID    NOT NULL DEFAULT gen_random_uuid(),
  query      TEXT    NOT NULL,
  intent     TEXT    NOT NULL,   -- sentinel | forecaster | archivist | fusion
  agent_ms   INTEGER,            -- total agent response time in ms
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Cosine similarity search RPC
--    Called from the Archivist serverless route via supabase.rpc('match_embeddings', ...)
CREATE OR REPLACE FUNCTION match_embeddings(
  query_embedding VECTOR(384),
  match_count     INTEGER DEFAULT 5,
  match_threshold FLOAT   DEFAULT 0.3
)
RETURNS TABLE (
  id         BIGINT,
  source     TEXT,
  content    TEXT,
  similarity FLOAT
)
LANGUAGE SQL STABLE AS $$
  SELECT
    id,
    source,
    content,
    1 - (embedding <=> query_embedding) AS similarity
  FROM research_embeddings
  WHERE 1 - (embedding <=> query_embedding) > match_threshold
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;
