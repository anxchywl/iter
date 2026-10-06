import { NextRequest, NextResponse } from "next/server";

const cookieName = "iter_portal_session";

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

function backendUrl(path: string) {
  return new URL(
    path,
    process.env.DIRECTORY_API_URL ?? "http://127.0.0.1:8000",
  );
}

export async function POST(request: NextRequest) {
  if (!hasTrustedOrigin(request)) {
    return NextResponse.json({ detail: "Forbidden" }, { status: 403 });
  }
  if (
    request.headers.get("content-type")?.split(";")[0] !== "application/json"
  ) {
    return NextResponse.json({ detail: "Invalid request" }, { status: 415 });
  }
  const body = (await request.json().catch(() => null)) as {
    secret?: unknown;
  } | null;
  if (!body || typeof body.secret !== "string" || body.secret.length > 256) {
    return NextResponse.json({ detail: "Invalid request" }, { status: 422 });
  }
  try {
    const upstream = await fetch(backendUrl("/api/v1/portal/sessions"), {
      method: "POST",
      headers: { Authorization: `Bearer ${body.secret}` },
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    const result = await upstream
      .json()
      .catch(() => ({ detail: "Unavailable" }));
    if (!upstream.ok) {
      return NextResponse.json(result, { status: upstream.status });
    }
    const response = NextResponse.json({
      actor: result.actor,
      role: result.role,
      organization_id: result.organization_id,
    });
    response.cookies.set(cookieName, result.token, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.PORTAL_COOKIE_SECURE === "true",
      path: "/",
      maxAge: 8 * 60 * 60,
    });
    return response;
  } catch {
    return NextResponse.json({ detail: "Unavailable" }, { status: 503 });
  }
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get(cookieName)?.value;
  if (!token)
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  try {
    const upstream = await fetch(backendUrl("/api/v1/portal/session"), {
      headers: { "X-Portal-Session": token },
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    return NextResponse.json(await upstream.json(), {
      status: upstream.status,
    });
  } catch {
    return NextResponse.json({ detail: "Unavailable" }, { status: 503 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!hasTrustedOrigin(request)) {
    return NextResponse.json({ detail: "Forbidden" }, { status: 403 });
  }
  const token = request.cookies.get(cookieName)?.value;
  if (token) {
    await fetch(backendUrl("/api/v1/portal/session"), {
      method: "DELETE",
      headers: { "X-Portal-Session": token },
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    }).catch(() => undefined);
  }
  const response = new NextResponse(null, { status: 204 });
  response.cookies.set(cookieName, "", { path: "/", maxAge: 0 });
  return response;
}
