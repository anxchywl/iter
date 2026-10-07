import { NextResponse } from "next/server";

export function portalCookieName() {
  return process.env.PORTAL_COOKIE_SECURE === "true"
    ? "__Host-iter_portal_session"
    : "iter_portal_session";
}

export function noStore(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}
