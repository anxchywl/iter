import { notFound } from "next/navigation";
import { DetailPage } from "@/components/pages";

export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  if (locale !== "ru" && locale !== "kk") notFound();
  return <DetailPage locale={locale} id={id} />;
}
