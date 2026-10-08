import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const nonce = randomBytes(16).toString("base64");
  const restrictedFrameRoute = /^\/(?:manage|portal)(?:\/|$)/.test(
    request.nextUrl.pathname,
  );
  const frameAncestors = restrictedFrameRoute
    ? "'self'"
    : "'self' https://*.telegram.org";
  const scriptSource =
    process.env.NODE_ENV === "development"
      ? `'self' 'unsafe-inline' 'unsafe-eval' 'nonce-${nonce}'`
      : `'self' 'nonce-${nonce}'`;
  const contentSecurityPolicy =
    `default-src 'self'; script-src ${scriptSource}; ` +
    `style-src 'self' 'unsafe-inline'; img-src 'self' data:; ` +
    `connect-src 'self'; font-src 'self'; object-src 'none'; ` +
    `base-uri 'self'; form-action 'self'; frame-ancestors ${frameAncestors}`;
  const requestHeaders = new Headers(request.headers);
  const segment = request.nextUrl.pathname.split("/")[1];
  requestHeaders.set(
    "x-iter-locale",
    segment === "ru" || segment === "kk" ? segment : "en",
  );
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);
  return response;
}

export const config = {
  matcher: ["/((?!api/|_next/|icon\\.svg|favicon.ico).*)"],
};
