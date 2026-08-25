import { NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return NextResponse.json({ error: "GITHUB_TOKEN not set" });

  try {
    const res = await fetch("https://models.inference.ai.azure.com/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ model: "gpt-4o", messages: [{ role: "user", content: "Say hello." }], max_tokens: 10 }),
      signal: AbortSignal.timeout(20_000),
    });
    const body = await res.text();
    return NextResponse.json({ status: res.status, body: body.slice(0, 500), token_prefix: token.slice(0, 8) });
  } catch (err) {
    const e = err as Error;
    return NextResponse.json({ error: e.message, cause: String((e as NodeJS.ErrnoException).cause) });
  }
}
