/**
 * /api/agent/archivist — Research RAG Sub-Agent (Pillar 2)
 *
 * 1. Embeds the user query via IBM watsonx slate-30m (384-dim)
 * 2. Calls Supabase match_embeddings RPC for top-5 cosine-similar chunks
 * 3. Passes retrieved chunks + query to watsonx Llama-4 Maverick for RAG synthesis
 * 4. Returns ArchivistData (identical contract to V1)
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generateText, generateEmbedding } from "@/lib/watsonx";
import type { ArchivistData } from "@/components/ArchivistPanel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ── Supabase RPC response shape ─────────────────────────────────────────── */
interface EmbeddingMatch {
  id: number;
  source: string;
  content: string;
  similarity: number;
}

/* ── RAG synthesis prompt ────────────────────────────────────────────────── */
function ragPrompt(context: string, query: string): string {
  return `\
You are the ORION Archivist — an astrophysics research assistant.
Answer the user's question using ONLY the provided research excerpts.
Be precise, cite which source supports each claim, and rate your confidence as high, medium, or low.

Research excerpts:
${context}

Question: ${query}

Return ONLY valid JSON with no markdown fences:
{"answer": "...", "sources": ["source1", "source2"], "confidence": "high|medium|low"}`;
}

/* ── helpers ─────────────────────────────────────────────────────────────── */
function stripFences(text: string): string {
  return text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

/* ── route handler ───────────────────────────────────────────────────────── */
export async function POST(req: NextRequest) {
  try {
    const body: unknown = await req.json();
    const query = ((body as Record<string, unknown>)?.query as string) ?? "";

    if (!query.trim()) {
      return NextResponse.json<ArchivistData>(
        { agent: "archivist", answer: "No query provided.", sources: [], confidence: "low" },
        { status: 400 }
      );
    }

    // Graceful degradation if Supabase is not yet configured
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (
      !supabaseUrl ||
      supabaseUrl === "your_supabase_url_here" ||
      !supabaseKey ||
      supabaseKey === "your_supabase_service_role_key_here"
    ) {
      return NextResponse.json<ArchivistData>(
        {
          agent: "archivist",
          answer:
            "The Archivist knowledge base is not yet connected. " +
            "Create a Supabase project, run scripts/supabase_schema.sql, " +
            "run scripts/migrate_to_supabase.py, then set NEXT_PUBLIC_SUPABASE_URL " +
            "and SUPABASE_SERVICE_ROLE_KEY in your environment.",
          sources: [],
          confidence: "low",
        },
        { status: 200 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Step 1 — embed the query
    let queryEmbedding: number[];
    try {
      queryEmbedding = await generateEmbedding(query.trim());
    } catch (embedErr) {
      throw new Error(`Embedding failed: ${embedErr instanceof Error ? embedErr.message : String(embedErr)}`);
    }

    // Step 2 — retrieve top-5 chunks from Supabase pgvector
    const { data: matches, error: rpcError } = await supabase.rpc("match_embeddings", {
      query_embedding: queryEmbedding,
      match_count: 5,
      match_threshold: 0.25,
    });

    if (rpcError) {
      throw new Error(`Supabase RPC error: ${rpcError.message}`);
    }

    const chunks = (matches as EmbeddingMatch[]) ?? [];

    if (chunks.length === 0) {
      return NextResponse.json<ArchivistData>(
        {
          agent: "archivist",
          answer:
            "No relevant research found in the knowledge base for this query. " +
            "Try rephrasing or ask about asteroids, solar flares, or astrophysics topics.",
          sources: [],
          confidence: "low",
        },
        { status: 200 }
      );
    }

    // Step 3 — build context block and call watsonx for RAG synthesis
    const context = chunks
      .map((c, i) => `[${i + 1}] Source: ${c.source}\n${c.content}`)
      .join("\n\n---\n\n");

    const uniqueSources = Array.from(new Set(chunks.map((c) => c.source)));

    let answer = "Unable to synthesise an answer from the retrieved research.";
    let confidence: ArchivistData["confidence"] = "low";

    try {
      const raw = await generateText(ragPrompt(context, query.trim()), {
        maxNewTokens: 512,
        temperature: 0.2,
      });
      const parsed = JSON.parse(stripFences(raw)) as {
        answer?: string;
        sources?: string[];
        confidence?: string;
      };
      if (parsed.answer) answer = parsed.answer;
      if (parsed.confidence) {
        const c = parsed.confidence.toLowerCase();
        confidence = c === "high" || c === "medium" ? c : "low";
      }
      // Use LLM-provided sources if available, else fall back to retrieved sources
      if (Array.isArray(parsed.sources) && parsed.sources.length > 0) {
        return NextResponse.json<ArchivistData>(
          { agent: "archivist", answer, sources: parsed.sources, confidence },
          { status: 200 }
        );
      }
    } catch (llmErr) {
      console.warn("[archivist] watsonx RAG synthesis failed:", llmErr);
      // Fall through — return raw retrieved context as answer
      answer = `Retrieved ${chunks.length} relevant research excerpt(s) but synthesis failed. Key sources: ${uniqueSources.join(", ")}`;
    }

    return NextResponse.json<ArchivistData>(
      { agent: "archivist", answer, sources: uniqueSources, confidence },
      { status: 200 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json<ArchivistData>(
      { agent: "archivist", answer: `Archivist error: ${message}`, sources: [], confidence: "low", error: message },
      { status: 500 }
    );
  }
}
