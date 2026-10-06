"use client";

import { useLinkStatus } from "next/link";

export function LinkPending() {
  const { pending } = useLinkStatus();
  return (
    <span
      className="link-pending"
      data-pending={pending || undefined}
      aria-hidden="true"
    />
  );
}
