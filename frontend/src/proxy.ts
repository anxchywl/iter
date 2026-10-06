import { NextResponse, type NextRequest } from "next/server";

// the shared root layout reads this for the initial lang attribute
export function proxy(request: NextRequest) {
  const segment = request.nextUrl.pathname.split("/")[1];
  const headers = new Headers(request.headers);
  headers.set(
    "x-iter-locale",
    segment === "ru" || segment === "kk" ? segment : "en",
  );
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!api/|_next/|icon\\.svg).*)"],
};
