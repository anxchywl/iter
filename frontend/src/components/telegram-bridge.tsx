"use client";

import { useEffect } from "react";
import {
  openOutside,
  startTelegramApp,
  type TelegramWindow,
} from "@/lib/telegram";

export function TelegramBridge() {
  useEffect(() => {
    const win = window as unknown as TelegramWindow;
    if (!startTelegramApp(win)) return;
    document.documentElement.dataset.telegram = "";
    function open(event: MouseEvent) {
      const anchor = (event.target as Element | null)?.closest?.(
        "a[target='_blank']",
      );
      if (anchor instanceof HTMLAnchorElement && openOutside(win, anchor.href))
        event.preventDefault();
    }
    document.addEventListener("click", open);
    return () => document.removeEventListener("click", open);
  }, []);
  return null;
}
