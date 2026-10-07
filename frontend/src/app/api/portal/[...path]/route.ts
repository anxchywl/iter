import { NextRequest, NextResponse } from "next/server";

import { clientAddressHeader } from "@/lib/client-address";
import { noStore, portalCookieName } from "@/lib/portal-session";

const allowedRoots = new Set(["admin", "provider", "portal"]);
function hasTrustedOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  if (process.env.PORTAL_ORIGIN) return origin === process.env.PORTAL_ORIGIN;
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

async function forward(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const cookieName = portalCookieName();
  const { path } = await context.params;
  if (!path.length || !allowedRoots.has(path[0])) {
    return NextResponse.json({ detail: "Not found" }, { status: 404 });
  }
  const session = request.cookies.get(cookieName)?.value;
  const authorization = request.headers.get("authorization") ?? "";
  if (
    !session &&
    (!authorization.startsWith("tma ") || authorization.length > 4100)
  )
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  if (request.method !== "GET" && !hasTrustedOrigin(request)) {
    return NextResponse.json({ detail: "Forbidden" }, { status: 403 });
  }
  const upstreamUrl = new URL(
    `/api/v1/${path.map(encodeURIComponent).join("/")}${request.nextUrl.search}`,
    process.env.DIRECTORY_API_URL ?? "http://127.0.0.1:8000",
  );
  const headers: Record<string, string> = authorization.startsWith("tma ")
    ? { Authorization: authorization }
    : { "X-Portal-Session": session! };
  Object.assign(headers, clientAddressHeader(request));
  let body: string | undefined;
  if (request.method === "POST" || request.method === "PUT") {
    if (
      request.headers.get("content-type")?.split(";")[0] !== "application/json"
    ) {
      return NextResponse.json({ detail: "Invalid request" }, { status: 415 });
    }
    body = await request.text();
    if (Buffer.byteLength(body) > 16_384) {
      return NextResponse.json(
        { detail: "Request too large" },
        { status: 413 },
      );
    }
    headers["Content-Type"] = "application/json";
  }
  try {
    const upstream = await fetch(upstreamUrl, {
      method: request.method,
      headers,
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    if (upstream.status === 204)
      return noStore(new NextResponse(null, { status: 204 }));
    return noStore(
      NextResponse.json(await upstream.json(), { status: upstream.status }),
    );
  } catch {
    return noStore(
      NextResponse.json({ detail: "Unavailable" }, { status: 503 }),
    );
  }
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const DELETE = forward;
