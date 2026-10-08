"use client";

import type { ReactNode } from "react";
import { getCopy, type Locale } from "@/lib/copy";
import { Sheet, useSheet } from "@/components/sheet";

export function AllReviews({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  const t = getCopy(locale);
  const sheet = useSheet();
  return (
    <>
      <button type="button" className="review-see-all" onClick={sheet.open}>
        {t.seeAll}
      </button>
      <Sheet
        sheet={sheet}
        title={t.reviews}
        titleId="all-reviews-title"
        className="all-reviews"
      >
        <div className="review-list">{children}</div>
      </Sheet>
    </>
  );
}
