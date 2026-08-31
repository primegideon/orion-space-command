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
export const maxDuration = 60;

/* ── Supabase RPC response shape ─────────────────────────────────────────── */
interface EmbeddingMatch {
  id: number;
  source: string;
  content: string;
  similarity: number;
}

/* ── RAG synthesis prompt ────────────────────────────────────────────────── */
function ragPrompt(context: string, query: string): string {
  // Fix A1: separate system instructions from the actual input with a clear
  // INPUT: marker. watsonx text/generation has no system turn — without this
  // separator the model treats the rules as text to continue rather than obey.
  return `You are the ORION Archivist — an astrophysics research assistant. Your job is to answer the question below using ONLY the research excerpts provided. Write 3–5 sentences of plain prose. Cite sources naturally (e.g. "According to Smith et al..."). End your answer with a confidence rating on its own line: one word, either "high", "medium", or "low". Do not use bullet points, numbered lists, bold, headings, asterisks, or any markdown. Do not repeat these instructions. Do not start with "I will" or "Here is".

RESEARCH EXCERPTS:
${context}

INPUT: ${query}

ANSWER:`;
}

/* ── helpers ─────────────────────────────────────────────────────────────── */
function cleanAnswer(raw: string): { answer: string; confidence: "high" | "medium" | "low" } {
  let text = raw
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]*`/g, "")
    .replace(/^#{1,6}\s+.*/gm, "")
    .replace(/^(step\s*\d+[:\-.]?.*|thinking[:\-.]?.*|reasoning[:\-.]?.*)/gim, "")
    .replace(/^\s*[\{\[].*/gm, "")
    .replace(/^>\s*/gm, "")
    // Fix A2: replace bullet/list markers with a space so adjacent sentences
    // don't merge into garbled prose (e.g. "findings:detection rates" → "findings: detection rates")
    .replace(/^\s*[-*+]\s+/gm, " ")
    .replace(/^\s*\d+\.\s+/gm, " ")
    .replace(/\*{1,3}([^*\n]+)\*{1,3}/g, "$1")
    .replace(/_{1,2}([^_\n]+)_{1,2}/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Fix A3: broaden confidence extraction — handle "high.", "High", "confidence: high",
  // trailing whitespace, period, or newline after the word
  let confidence: "high" | "medium" | "low" = "medium";
  const confMatch = text.match(/(?:^|\n)\s*(?:confidence[:\s]+)?(high|medium|low)[.\s]*$/i);
  if (confMatch) {
    confidence = confMatch[1].toLowerCase() as "high" | "medium" | "low";
    // Trim from the start of the matched confidence line to end of string
    const matchStart = text.lastIndexOf(confMatch[0].trimStart());
    if (matchStart > 0) text = text.slice(0, matchStart).trim();
  }

  return { answer: text, confidence };
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
      // Embedding service unavailable — fall back to Granite direct answer
      // Fix A6: use same INPUT:/ANSWER: separator as ragPrompt to prevent instruction echo
      console.warn("[archivist] embedding failed, falling back to direct LLM answer:", embedErr);
      const fallbackAnswer = await generateText(
        `You are the ORION Archivist — an astrophysics research assistant. Answer the question below using your knowledge of space science, asteroids, solar activity, and astrophysics. Write 2–3 sentences of plain prose. Do not use bullet points, markdown, or numbered lists. Do not repeat these instructions.\n\nINPUT: ${query.trim()}\n\nANSWER:`,
        { maxNewTokens: 400, temperature: 0.2, modelId: "ibm/granite-4-h-small" }
      );
      return NextResponse.json<ArchivistData>(
        { agent: "archivist", answer: fallbackAnswer.trim(), sources: ["watsonx knowledge base"], confidence: "medium", model_used: "granite-4-h-small" },
        { status: 200 }
      );
    }

    // Step 2 — retrieve top-5 chunks from Supabase pgvector
    // Fix A5: raise threshold from 0.25 → 0.35 to avoid off-topic chunks
    const { data: matches, error: rpcError } = await supabase.rpc("match_embeddings", {
      query_embedding: queryEmbedding,
      match_count: 5,
      match_threshold: 0.35,
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
          model_used: "granite-4-h-small",
        },
        { status: 200 }
      );
    }

    // Step 3 — build context block and call watsonx for RAG synthesis
    // Fix A4: add similarity score and topic index so model can distinguish sources
    const context = chunks
      .map((c, i) => `[${i + 1}] Source: ${c.source} (relevance: ${(c.similarity * 100).toFixed(0)}%)\n${c.content}`)
      .join("\n\n---\n\n");

    const uniqueSources = Array.from(new Set(chunks.map((c) => c.source)));

    let answer = "Unable to synthesise an answer from the retrieved research.";
    let confidence: ArchivistData["confidence"] = "low";

    // Try Granite first for domain-specific RAG synthesis; fall back to Llama-4 on any failure.
    const GRANITE_MODEL = "ibm/granite-4-h-small";
    let synthRaw: string | null = null;
    let modelUsed = "fallback";

    try {
      synthRaw = await generateText(ragPrompt(context, query.trim()), {
        maxNewTokens: 600,  // 600 gives 5 full sentences + confidence word
        temperature: 0.15,  // lower temp = more faithful to source chunks
        modelId: GRANITE_MODEL,
      });
      if (synthRaw) modelUsed = "granite-4-h-small";
    } catch (graniteErr) {
      console.warn("[archivist] granite synthesis failed, falling back to llama:", graniteErr);
      try {
        synthRaw = await generateText(ragPrompt(context, query.trim()), {
          maxNewTokens: 600,
          temperature: 0.15,
        });
        if (synthRaw) modelUsed = "llama-4-maverick";
      } catch (llamaErr) {
        console.warn("[archivist] watsonx RAG synthesis failed:", llamaErr);
      }
    }

    if (synthRaw) {
      const cleaned = cleanAnswer(synthRaw);
      answer = cleaned.answer;
      confidence = cleaned.confidence;
    } else {
      answer = `Retrieved ${chunks.length} relevant research excerpt(s) but synthesis failed. Key sources: ${uniqueSources.join(", ")}`;
    }

    return NextResponse.json<ArchivistData>(
      { agent: "archivist", answer, sources: uniqueSources, confidence, model_used: modelUsed },
      { status: 200 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const is429 = message.includes("429") || message.includes("consumption_limit_reached");
    const friendly = is429
      ? "The AI model hit the rate limit (2 req/s on the free plan). Wait a moment and try again."
      : "The Archivist pipeline encountered an error. Please try again.";
    return NextResponse.json<ArchivistData>(
      { agent: "archivist", answer: friendly, sources: [], confidence: "low", model_used: "granite-4-h-small" },
      { status: 200 }
    );
  }
}
