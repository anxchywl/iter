type TelegramWindow = {
  location: { hash: string };
  parent: unknown;
  TelegramWebviewProxy?: {
    postEvent: (eventType: string, eventData: string) => void;
  };
  postMessage?: unknown;
};

type ParentFrame = { postMessage: (message: string, origin: string) => void };

const events: [string, object][] = [
  ["web_app_ready", {}],
  ["web_app_expand", {}],
  ["web_app_setup_swipe_behavior", { allow_vertical_swipe: false }],
];

// asks the telegram client for a full-height view without vertical swipe-to-close
export function startTelegramApp(win: TelegramWindow): boolean {
  const proxy = win.TelegramWebviewProxy;
  if (proxy) {
    for (const [type, data] of events)
      proxy.postEvent(type, JSON.stringify(data));
    return true;
  }
  const framed =
    win.parent !== win && /tgWebAppPlatform=/.test(win.location.hash);
  if (!framed) return false;
  const parent = win.parent as ParentFrame;
  for (const [type, data] of events)
    parent.postMessage(
      JSON.stringify({ eventType: type, eventData: data }),
      "https://web.telegram.org",
    );
  return true;
}
