import { NextRequest, NextResponse } from "next/server";

import { clientAddressHeader } from "@/lib/client-address";
import { noStore, portalCookieName } from "@/lib/portal-session";

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
  const cookieName = portalCookieName();
  if (!hasTrustedOrigin(request))
    return NextResponse.json({ detail: "Forbidden" }, { status: 403 });
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json")
    return NextResponse.json({ detail: "Invalid request" }, { status: 415 });
  const body = (await request.json().catch(() => null)) as {
    access_key?: unknown;
  } | null;
  if (
    !body ||
    typeof body.access_key !== "string" ||
    body.access_key.length > 256
  )
    return NextResponse.json({ detail: "Invalid request" }, { status: 422 });
  try {
    const upstream = await fetch(backendUrl("/api/v1/portal/sessions"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${body.access_key}`,
        ...clientAddressHeader(request),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    const result = await upstream
      .json()
      .catch(() => ({ detail: "Unavailable" }));
    if (!upstream.ok)
      return noStore(NextResponse.json(result, { status: upstream.status }));
    const response = NextResponse.json({
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
    return noStore(response);
  } catch {
    return noStore(
      NextResponse.json({ detail: "Unavailable" }, { status: 503 }),
    );
  }
}

export async function GET(request: NextRequest) {
  const cookieName = portalCookieName();
  const token = request.cookies.get(cookieName)?.value;
  if (!token)
    return noStore(
      NextResponse.json({ detail: "Unauthorized" }, { status: 401 }),
    );
  try {
    const upstream = await fetch(backendUrl("/api/v1/portal/session"), {
      headers: { "X-Portal-Session": token },
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    return noStore(
      NextResponse.json(await upstream.json(), { status: upstream.status }),
    );
  } catch {
    return noStore(
      NextResponse.json({ detail: "Unavailable" }, { status: 503 }),
    );
  }
}

export async function DELETE(request: NextRequest) {
  const cookieName = portalCookieName();
  if (!hasTrustedOrigin(request))
    return NextResponse.json({ detail: "Forbidden" }, { status: 403 });
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
  response.headers.set("Clear-Site-Data", '"cache", "cookies", "storage"');
  return noStore(response);
}
