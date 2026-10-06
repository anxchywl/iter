import type { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "iter | Summer Work Travel vacancies",
  description:
    "Browse current employer vacancies, compare conditions, and contact employers directly.",
};

export default function DefaultLayout({ children }: { children: ReactNode }) {
  return children;
}
