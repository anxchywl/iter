"use client";

import { createPortal } from "react-dom";
import { useLinkStatus } from "next/link";

function Bar({ width, height = 12 }: { width: string; height?: number }) {
  return <span className="skeleton-bar" style={{ width, height }} />;
}

function DetailSkeleton() {
  return (
    <>
      <Bar width="34%" />
      <div className="skeleton-card">
        <div className="skeleton-row">
          <Bar width="22%" height={20} />
          <Bar width="18%" height={20} />
          <Bar width="30%" height={20} />
        </div>
        <Bar width="62%" height={26} />
        <Bar width="44%" />
        <Bar width="100%" height={44} />
      </div>
      <div className="skeleton-card skeleton-grid">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index}>
            <Bar width="50%" height={9} />
            <Bar width="80%" />
          </div>
        ))}
      </div>
    </>
  );
}

function ListSkeleton() {
  return (
    <>
      <Bar width="40%" height={26} />
      <Bar width="100%" height={42} />
      {Array.from({ length: 3 }, (_, index) => (
        <div className="skeleton-card" key={index}>
          <Bar width="46%" height={10} />
          <Bar width="64%" height={18} />
          <Bar width="38%" />
          <Bar width="72%" />
        </div>
      ))}
    </>
  );
}

export function LinkPending({ skeleton }: { skeleton?: "detail" | "list" }) {
  const { pending } = useLinkStatus();
  return (
    <>
      <span
        className="link-pending"
        data-pending={pending || undefined}
        aria-hidden="true"
      />
      {pending &&
        skeleton &&
        createPortal(
          <div className="route-skeleton" aria-hidden="true">
            <div className="skeleton-page">
              {skeleton === "detail" ? <DetailSkeleton /> : <ListSkeleton />}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
