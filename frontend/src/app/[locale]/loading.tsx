"use client";

import { useParams } from "next/navigation";
import { getCopy } from "@/lib/copy";

export default function Loading() {
  const locale = useParams().locale === "ru" ? "ru" : "kk";
  return (
    <main className="content-wrap loading-panel" role="status">
      {getCopy(locale).loading}
    </main>
  );
}
