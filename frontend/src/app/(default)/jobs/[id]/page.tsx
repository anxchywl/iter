import { DetailPage } from "@/components/pages";

export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <DetailPage locale="en" id={(await params).id} />;
}
