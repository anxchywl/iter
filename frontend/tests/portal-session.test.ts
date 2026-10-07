import { afterEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { noStore, portalCookieName } from "../src/lib/portal-session";

afterEach(() => vi.unstubAllEnvs());

describe("portal session transport", () => {
  it("uses a host-only cookie name for production HTTPS", () => {
    vi.stubEnv("PORTAL_COOKIE_SECURE", "true");
    expect(portalCookieName()).toBe("__Host-iter_portal_session");
  });

  it("keeps the local HTTP cookie compatible", () => {
    vi.stubEnv("PORTAL_COOKIE_SECURE", "false");
    expect(portalCookieName()).toBe("iter_portal_session");
  });

  it("marks authenticated responses as non-cacheable", () => {
    const response = noStore(NextResponse.json({ role: "provider" }));
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
