/**
 * /api/agent/archivist — Research RAG Sub-Agent (Pillar 2 stub)
 *
 * Full implementation requires Supabase pgvector (Pillar 2).
 * This stub returns a graceful "coming soon" response so the Archivist panel
 * renders correctly and the overall pipeline compiles cleanly.
 *
 * When Pillar 2 is complete, replace this stub with:
 *   1. Embed the query via watsonx embedding endpoint
 *   2. Call Supabase `match_embeddings` RPC for top-k chunks
 *   3. Pass retrieved chunks to watsonx Llama-4 Maverick for RAG synthesis
 *   4. Return ArchivistData with answer, sources, confidence
 */
import { NextRequest, NextResponse } from "next/server";
import type { ArchivistData } from "@/components/ArchivistPanel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body: unknown = await req.json();
  const query = (body as Record<string, unknown>)?.query ?? "";

  const response: ArchivistData = {
    agent: "archivist",
    answer:
      `The Archivist knowledge base is being migrated to Supabase pgvector (Pillar 2). ` +
      `Your query — "${String(query)}" — has been received and will be answered once the vector index is live.`,
    sources: [],
    confidence: "low",
  };

  return NextResponse.json(response, { status: 200 });
}
