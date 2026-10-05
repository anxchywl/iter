"use client";

import { getCopy, type Locale } from "@/lib/copy";
import { safeContact, type ContactLink } from "@/lib/links";
import { ChannelIcon, ExternalIcon } from "@/components/icons";
import { Sheet, useSheet } from "@/components/sheet";

type Channel = { link: ContactLink; label: string };

function channelLabel(link: ContactLink, locale: Locale): string {
  const t = getCopy(locale);
  return link.kind === "telegram"
    ? "Telegram"
    : link.kind === "whatsapp"
      ? "WhatsApp"
      : link.kind === "email"
        ? t.channelEmail
        : link.kind === "phone"
          ? t.channelPhone
          : t.channelWeb;
}

function ChannelGlyph({ kind }: { kind: ContactLink["kind"] }) {
  if (kind === "telegram") return <ChannelIcon channel="telegram" />;
  if (kind === "whatsapp") return <ChannelIcon channel="whatsapp" />;
  if (kind === "email") return <ChannelIcon channel="mail" />;
  if (kind === "phone") return <ChannelIcon channel="phone" />;
  return <ExternalIcon />;
}

export function ContactAction({
  url,
  website,
  locale,
}: {
  url: string;
  website?: string | null;
  locale: Locale;
}) {
  const t = getCopy(locale);
  const sheet = useSheet();
  const contact = safeContact(url);
  if (!contact) return <p className="notice">{t.unsafeContact}</p>;
  const site = website ? safeContact(website) : null;
  const channels: Channel[] = [
    { link: contact, label: channelLabel(contact, locale) },
    ...(site && site.href !== contact.href
      ? [{ link: site, label: t.employerSite }]
      : []),
  ];
  return (
    <>
      <button
        type="button"
        className="primary-button contact-trigger"
        onClick={sheet.open}
      >
        {t.directContact}
      </button>
      <Sheet
        sheet={sheet}
        title={t.directContact}
        titleId="contact-title"
        className="contact-action"
      >
        <div className="contact-sheet">
          <p className="contact-intro">{t.contactIntro}</p>
          <ul className="channel-list">
            {channels.map(({ link, label }) => (
              <li key={link.href}>
                <a
                  className="channel"
                  data-kind={link.kind}
                  href={link.href}
                  target={
                    link.kind === "email" || link.kind === "phone"
                      ? undefined
                      : "_blank"
                  }
                  rel="noopener noreferrer"
                  aria-label={`${t.continue}: ${label}, ${link.destination}`}
                >
                  <span className="channel-badge">
                    <ChannelGlyph kind={link.kind} />
                  </span>
                  <span className="channel-text">
                    <strong>{label}</strong>
                    <span className="destination" dir="ltr">
                      {link.destination}
                    </span>
                  </span>
                  <ExternalIcon />
                </a>
              </li>
            ))}
          </ul>
        </div>
      </Sheet>
    </>
  );
}
