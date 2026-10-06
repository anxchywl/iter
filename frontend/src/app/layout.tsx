import type { ReactNode } from "react";
import { TelegramBridge } from "@/components/telegram-bridge";
import { requestLocale } from "@/lib/request-locale";
import "@/app/globals.css";

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang={await requestLocale()} data-scroll-behavior="smooth">
      <body>
        <TelegramBridge />
        {children}
      </body>
    </html>
  );
}
