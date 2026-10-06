import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { TelegramBridge } from "@/components/telegram-bridge";
import { miniAppLink } from "@/lib/links";
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
        <AppShell
          demoMode={process.env.DIRECTORY_DEMO_MODE === "true"}
          telegram={miniAppLink()}
          year={new Date().getFullYear()}
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}
