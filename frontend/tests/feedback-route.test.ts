import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../src/app/api/feedback/[kind]/route";

afterEach(() => vi.unstubAllGlobals());

describe("feedback proxy", () => {
  it("rejects a multibyte body over 16 KiB before forwarding", async () => {
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
});
