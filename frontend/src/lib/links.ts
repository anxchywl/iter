export type ContactLink = {
  href: string;
  destination: string;
  kind: "web" | "telegram" | "email" | "phone";
};

export function safeContact(value: string): ContactLink | null {
  if (value.length > 2048 || /[\u0000-\u001f\u007f]/.test(value)) return null;
  if (/^mailto:[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(value)) {
    return { href: value, destination: value.slice(7), kind: "email" };
  }
  if (/^tel:\+?[0-9]{7,15}$/.test(value)) {
    return { href: value, destination: value.slice(4), kind: "phone" };
  }
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      !url.hostname ||
      url.username ||
      url.password
    )
      return null;
    if (url.hostname === "t.me" || url.hostname === "telegram.me") {
      if (
        !/^\/[A-Za-z0-9_]{5,32}\/?$/.test(url.pathname) ||
        url.search ||
        url.hash
      )
        return null;
      return { href: url.href, destination: url.href, kind: "telegram" };
    }
    return { href: url.href, destination: url.href, kind: "web" };
  } catch {
    return null;
  }
}

export function miniAppLink(id?: string): string | null {
  const bot = process.env.TELEGRAM_BOT_USERNAME;
  const app = process.env.TELEGRAM_APP_SHORT_NAME;
  if (!bot || !/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(bot)) return null;
  if (app && !/^[A-Za-z0-9_]{3,64}$/.test(app)) return null;
  if (
    id &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
    return null;
  const path = app ? `/${app}` : "";
  const param = id ? `?startapp=job_${id}` : "?startapp";
  return `https://t.me/${bot}${path}${param}`;
}

export function startListing(
  value: string | string[] | undefined,
): string | null {
  if (typeof value !== "string") return null;
  const match =
    /^job_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(
      value,
    );
  return match?.[1] ?? null;
}
