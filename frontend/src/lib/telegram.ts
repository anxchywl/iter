export type TelegramWindow = {
  location: { hash: string; search?: string };
  parent: unknown;
  TelegramWebviewProxy?: {
    postEvent: (eventType: string, eventData: string) => void;
  };
  external?: { notify?: (message: string) => void };
  webkit?: {
    messageHandlers?: {
      performAction?: {
        postMessage: (message: {
          eventName: string;
          eventData: string;
        }) => void;
      };
    };
  };
  Telegram?: { WebApp?: { initData?: string } };
  sessionStorage?: Pick<Storage, "getItem" | "setItem">;
};

type ParentFrame = { postMessage: (message: string, origin: string) => void };

const launchKey = "iter.telegram.launch";
const paper = "#ffffff";

const startEvents: [string, object][] = [
  ["web_app_ready", {}],
  ["web_app_expand", {}],
  ["web_app_setup_swipe_behavior", { allow_vertical_swipe: false }],
  ["web_app_set_header_color", { color: paper }],
  ["web_app_set_background_color", { color: paper }],
];

function hasLaunchSignal(win: TelegramWindow): boolean {
  const hash = win.location.hash.replace(/^#/, "");
  if (/(?:^|&)tgWebAppPlatform=/.test(hash)) return true;
  const search = (win.location.search ?? "").replace(/^\?/, "");
  return /(?:^|&)tgWebApp(?:StartParam|Platform)(?:=|&|$)/.test(search);
}

function hasNativeBridge(win: TelegramWindow): boolean {
  return Boolean(
    win.TelegramWebviewProxy ||
    win.external?.notify ||
    win.webkit?.messageHandlers?.performAction ||
    win.Telegram?.WebApp,
  );
}

// telegram puts launch data in the first fragment and direct-link starts in the query
function launchParams(win: TelegramWindow): URLSearchParams | null {
  const hash = win.location.hash.replace(/^#/, "");
  if (/(?:^|&)tgWebAppPlatform=/.test(hash)) {
    try {
      win.sessionStorage?.setItem(launchKey, hash);
    } catch {}
    return new URLSearchParams(hash);
  }
  const search = (win.location.search ?? "").replace(/^\?/, "");
  if (/(?:^|&)tgWebApp(?:StartParam|Platform)(?:=|&|$)/.test(search)) {
    try {
      win.sessionStorage?.setItem(launchKey, search);
    } catch {}
    return new URLSearchParams(search);
  }
  try {
    const stored = win.sessionStorage?.getItem(launchKey);
    return stored ? new URLSearchParams(stored) : null;
  } catch {
    return null;
  }
}

export function telegramInitData(win: TelegramWindow): string | null {
  const value =
    launchParams(win)?.get("tgWebAppData") ?? win.Telegram?.WebApp?.initData;
  return value && value.length <= 4096 ? value : null;
}

function postEvent(win: TelegramWindow, type: string, data: object): boolean {
  const proxy = win.TelegramWebviewProxy;
  if (proxy) {
    proxy.postEvent(type, JSON.stringify(data));
    return true;
  }
  const external = win.external?.notify;
  if (external) {
    external(JSON.stringify({ eventType: type, eventData: data }));
    return true;
  }
  const macOS = win.webkit?.messageHandlers?.performAction;
  if (macOS) {
    macOS.postMessage({ eventName: type, eventData: JSON.stringify(data) });
    return true;
  }
  if (win.parent === win || (!hasLaunchSignal(win) && !launchParams(win)))
    return false;
  (win.parent as ParentFrame).postMessage(
    JSON.stringify({ eventType: type, eventData: data }),
    "https://web.telegram.org",
  );
  return true;
}

// asks the telegram client for a full-height view without vertical swipe-to-close
export function startTelegramApp(win: TelegramWindow): boolean {
  const params = launchParams(win);
  if (!hasNativeBridge(win) && !hasLaunchSignal(win) && !params) return false;
  for (const [type, data] of startEvents) postEvent(win, type, data);
  return true;
}

// a webview cannot leave the mini app by itself, so telegram opens outbound links
export function openOutside(win: TelegramWindow, href: string): boolean {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.hostname === "t.me" || url.hostname === "telegram.me") {
    return postEvent(win, "web_app_open_tg_link", {
      path_full: `${url.pathname}${url.search}`,
    });
  }
  return postEvent(win, "web_app_open_link", { url: url.href });
}
