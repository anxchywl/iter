import type { ReactNode } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/copy";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return locale === "ru"
    ? {
        title: "iter | Летние вакансии",
        description:
          "Изучайте условия работы и связывайтесь с работодателем напрямую.",
      }
    : {
        title: "iter | Жазғы бос орындар",
        description:
          "Жұмыс шарттарын қарап, жұмыс берушіге тікелей хабарласыңыз.",
      };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if ((locale !== "ru" && locale !== "kk") || !isLocale(locale)) notFound();
  return children;
}
