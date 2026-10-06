import { headers } from "next/headers";
import { isLocale, type Locale } from "@/lib/copy";

export async function requestLocale(): Promise<Locale> {
  const value = (await headers()).get("x-iter-locale") ?? "en";
  return isLocale(value) ? value : "en";
}
