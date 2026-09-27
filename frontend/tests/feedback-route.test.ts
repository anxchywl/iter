import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../src/app/api/feedback/[kind]/route";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("feedback proxy", () => {
  it("rejects a multibyte body over 16 KiB before forwarding", async () => {
    vi.stubEnv("FEEDBACK_ENABLED", "true");
    const forward = vi.fn();
    vi.stubGlobal("fetch", forward);
    const request = new NextRequest("http://localhost/api/feedback/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "é".repeat(9000) }),
    });
    const response = await POST(request, {
      params: Promise.resolve({ kind: "reviews" }),
    });
    expect(response.status).toBe(413);
    expect(forward).not.toHaveBeenCalled();
  });

  it("does not forward submissions while feedback is disabled", async () => {
    vi.stubEnv("FEEDBACK_ENABLED", "false");
    const forward = vi.fn();
    vi.stubGlobal("fetch", forward);
    const request = new NextRequest("http://localhost/api/feedback/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const response = await POST(request, {
      params: Promise.resolve({ kind: "reviews" }),
    });
    expect(response.status).toBe(503);
    expect(forward).not.toHaveBeenCalled();
  });
});
