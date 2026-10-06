import type { ReactNode } from "react";
import { requestLocale } from "@/lib/request-locale";
import "@/app/globals.css";

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang={await requestLocale()} data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
