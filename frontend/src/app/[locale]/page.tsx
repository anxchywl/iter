import { notFound } from "next/navigation";
import { DirectoryPage } from "@/components/pages";
import type { SearchInput } from "@/lib/directory";

export const dynamic = "force-dynamic";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchInput>;
}) {
  const { locale } = await params;
  if (locale !== "ru" && locale !== "kk") notFound();
  return <DirectoryPage locale={locale} searchParams={await searchParams} />;
}
