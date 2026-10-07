import { describe, expect, it } from "vitest";
import { miniAppLink, miniAppPortalLink, startPortal } from "../src/lib/links";
import {
  openOutside,
  startTelegramApp,
  telegramInitData,
  telegramMarkScript,
  type TelegramWindow,
} from "../src/lib/telegram";

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
}

function framedWindow(hash: string) {
  const posted: { message: string; origin: string }[] = [];
  const win: TelegramWindow = {
    location: { hash },
    parent: {
      postMessage: (message: string, origin: string) =>
        posted.push({ message, origin }),
    },
    sessionStorage: storage(),
  };
  return { win, posted };
}

const initData = "auth_date=1700000000&user=%7B%22id%22%3A42%7D&hash=abc";
const launch = `#tgWebAppData=${encodeURIComponent(initData)}&tgWebAppVersion=8.0&tgWebAppPlatform=weba`;

describe("telegram bridge", () => {
  it("keeps launch init data after the fragment is gone", () => {
    const { win } = framedWindow(launch);
    expect(telegramInitData(win)).toBe(initData);
    win.location.hash = "";
    expect(telegramInitData(win)).toBe(initData);
  });

  it("ignores ordinary browsers and fragments without telegram launch data", () => {
    const plain: TelegramWindow = { location: { hash: "" }, parent: null };
    plain.parent = plain;
    expect(startTelegramApp(plain)).toBe(false);
    expect(openOutside(plain, "https://example.com")).toBe(false);
    const { win, posted } = framedWindow(
      `#tgWebAppData=${encodeURIComponent(initData)}`,
    );
    expect(telegramInitData(win)).toBeNull();
    expect(startTelegramApp(win)).toBe(false);
    expect(posted).toHaveLength(0);
  });

  it("expands, colors, and locks vertical swipes in native clients", () => {
    const sent: [string, unknown][] = [];
    const win: TelegramWindow = {
      location: { hash: "" },
      parent: null,
      TelegramWebviewProxy: {
        postEvent: (type, data) => sent.push([type, JSON.parse(data)]),
      },
    };
    win.parent = win;
    expect(startTelegramApp(win)).toBe(true);
    expect(sent).toEqual([
      ["web_app_ready", {}],
      ["web_app_expand", {}],
      ["web_app_setup_swipe_behavior", { allow_vertical_swipe: false }],
      ["web_app_set_header_color", { color: "#ffffff" }],
      ["web_app_set_background_color", { color: "#ffffff" }],
    ]);
  });

  it("does nothing in an unknown frame without launch parameters", () => {
    const { win, posted } = framedWindow("");
    expect(startTelegramApp(win)).toBe(false);
    expect(openOutside(win, "https://example.com")).toBe(false);
    expect(posted).toHaveLength(0);
  });

  it("posts start events only to telegram web", () => {
    const { win, posted } = framedWindow(launch);
    expect(startTelegramApp(win)).toBe(true);
    expect(posted.map((item) => JSON.parse(item.message).eventType)).toEqual([
      "web_app_ready",
      "web_app_expand",
      "web_app_setup_swipe_behavior",
      "web_app_set_header_color",
      "web_app_set_background_color",
    ]);
    expect(new Set(posted.map((item) => item.origin))).toEqual(
      new Set(["https://web.telegram.org"]),
    );
  });

  it("opens telegram and https links through the client", () => {
    const events: [string, string][] = [];
    const win: TelegramWindow = {
      location: { hash: "" },
      parent: null,
      TelegramWebviewProxy: {
        postEvent: (type, data) => events.push([type, data]),
      },
    };
    expect(openOutside(win, "https://t.me/validuser")).toBe(true);
    expect(openOutside(win, "https://example.com/apply?a=1")).toBe(true);
    expect(openOutside(win, "javascript:alert(1)")).toBe(false);
    expect(openOutside(win, "http://example.com")).toBe(false);
    expect(events).toEqual([
      ["web_app_open_tg_link", JSON.stringify({ path_full: "/validuser" })],
      [
        "web_app_open_link",
        JSON.stringify({ url: "https://example.com/apply?a=1" }),
      ],
    ]);
  });

  it("marks the page before paint only inside telegram", () => {
    function marked(
      globals: { proxy?: boolean; hash?: string; stored?: string },
      broken = false,
    ) {
      const dataset: Record<string, string> = {};
      const storage = {
        getItem: (key: string) => {
          if (broken) throw new Error("storage blocked");
          return key === "iter.telegram.launch"
            ? (globals.stored ?? null)
            : null;
        },
      };
      new Function(
        "window",
        "location",
        "sessionStorage",
        "document",
        telegramMarkScript,
      )(
        globals.proxy ? { TelegramWebviewProxy: {} } : {},
        { hash: globals.hash ?? "" },
        storage,
        { documentElement: { dataset } },
      );
      return "telegram" in dataset;
    }
    expect(marked({})).toBe(false);
    expect(marked({ hash: "#section" })).toBe(false);
    expect(marked({ hash: "#tgWebAppData=x" })).toBe(false);
    expect(marked({ proxy: true })).toBe(true);
    expect(marked({ hash: "#tgWebAppData=x&tgWebAppPlatform=ios" })).toBe(true);
    expect(marked({ stored: "tgWebAppPlatform=weba" })).toBe(true);
    expect(marked({}, true)).toBe(false);
    expect(marked({ proxy: true }, true)).toBe(true);
  });

  it("routes only known management start parameters", () => {
    expect(startPortal("manage")).toBe("/manage");
    expect(startPortal("admin")).toBe("/admin");
    expect(startPortal("admin/../x")).toBeNull();
    expect(startPortal(["admin"])).toBeNull();
    expect(miniAppPortalLink("admin")).toBeNull();
    process.env.TELEGRAM_BOT_USERNAME = "iter_app_bot";
    expect(miniAppLink()).toBe("https://t.me/iter_app_bot?startapp");
    expect(miniAppPortalLink("manage")).toBe(
      "https://t.me/iter_app_bot?startapp=manage",
    );
    delete process.env.TELEGRAM_BOT_USERNAME;
  });
});
