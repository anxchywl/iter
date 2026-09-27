import { DirectoryPage } from "@/components/pages";
import type { SearchInput } from "@/lib/directory";

export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchInput>;
}) {
  return <DirectoryPage locale="en" searchParams={await searchParams} />;
}
