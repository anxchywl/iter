import { describe, expect, it } from "vitest";
import { startTelegramApp } from "../src/lib/telegram";

describe("telegram bridge", () => {
  it("expands and locks vertical swipes in native clients", () => {
    const sent: [string, unknown][] = [];
    const win = {
      location: { hash: "" },
      parent: null as unknown,
      TelegramWebviewProxy: {
        postEvent: (type: string, data: string) =>
          sent.push([type, JSON.parse(data)]),
      },
    };
    win.parent = win;
    expect(startTelegramApp(win)).toBe(true);
    expect(sent).toEqual([
      ["web_app_ready", {}],
      ["web_app_expand", {}],
      ["web_app_setup_swipe_behavior", { allow_vertical_swipe: false }],
    ]);
  });

  it("posts only to telegram web when framed with launch parameters", () => {
    const messages: [string, string][] = [];
    const parent = {
      postMessage: (message: string, origin: string) =>
        messages.push([message, origin]),
    };
    expect(
      startTelegramApp({
        location: { hash: "#tgWebAppData=x&tgWebAppPlatform=weba" },
        parent,
      }),
    ).toBe(true);
    expect(messages).toHaveLength(3);
    expect(
      messages.every(([, origin]) => origin === "https://web.telegram.org"),
    ).toBe(true);
    expect(JSON.parse(messages[1][0])).toEqual({
      eventType: "web_app_expand",
      eventData: {},
    });
  });

  it("does nothing in an ordinary browser or unknown frame", () => {
    const messages: string[] = [];
    const parent = { postMessage: (message: string) => messages.push(message) };
    const plain = { location: { hash: "" }, parent: null as unknown };
    plain.parent = plain;
    expect(startTelegramApp(plain)).toBe(false);
    expect(startTelegramApp({ location: { hash: "" }, parent })).toBe(false);
    expect(messages).toHaveLength(0);
  });
});
