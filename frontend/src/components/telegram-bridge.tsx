"use client";

import { useEffect } from "react";
import { startTelegramApp } from "@/lib/telegram";

export function TelegramBridge() {
  useEffect(() => {
    startTelegramApp(
      window as unknown as Parameters<typeof startTelegramApp>[0],
    );
  }, []);
  return null;
}
