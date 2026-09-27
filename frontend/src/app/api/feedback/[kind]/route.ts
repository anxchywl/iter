import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ kind: string }> },
) {
  const { kind } = await params;
  if (kind !== "reviews" && kind !== "reports") {
    return NextResponse.json({ detail: "Not found" }, { status: 404 });
  }
  if (process.env.FEEDBACK_ENABLED !== "true") {
    return NextResponse.json(
      { detail: "Submissions unavailable" },
      { status: 503 },
    );
  }
  if (
    request.headers.get("content-type")?.split(";")[0] !== "application/json"
  ) {
    return NextResponse.json({ detail: "Invalid request" }, { status: 415 });
  }
  const chunks: Uint8Array[] = [];
  const reader = request.body?.getReader();
  let size = 0;
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16_384) {
        await reader.cancel();
        return NextResponse.json(
          { detail: "Request too large" },
          { status: 413 },
        );
      }
      chunks.push(value);
    }
  }
  const body = Buffer.concat(chunks).toString("utf8");
  const base = process.env.DIRECTORY_API_URL ?? "http://127.0.0.1:8000";
  try {
    const response = await fetch(new URL(`/api/v1/${kind}`, base), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    const result = await response.json();
    return NextResponse.json(result, { status: response.status });
  } catch {
    return NextResponse.json({ detail: "Unavailable" }, { status: 503 });
  }
}
