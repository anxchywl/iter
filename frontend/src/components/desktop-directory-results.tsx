"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { Locale } from "@/lib/copy";
import type { Listing } from "@/lib/directory";
import { DesktopListingPreviewInteractive } from "@/components/desktop-listing-preview";
import { ListingCard } from "@/components/presentation";
import { useFavouriteIds } from "@/components/favorite";

export function DesktopDirectoryResults({
  listings,
  locale,
  children,
  favouritesOnly = false,
  emptyLabel,
}: {
  listings: Listing[];
  locale: Locale;
  children?: ReactNode;
  favouritesOnly?: boolean;
  emptyLabel: string;
}) {
  const favouriteIds = useFavouriteIds(favouritesOnly);
  const visibleListings = useMemo(
    () =>
      favouritesOnly
        ? listings.filter((listing) => favouriteIds.includes(listing.id))
        : listings,
    [favouriteIds, favouritesOnly, listings],
  );
  const first = visibleListings[0];
  const [selectedId, setSelectedId] = useState(first?.id ?? "");
  const selected =
    visibleListings.find((listing) => listing.id === selectedId) ?? first;

  if (!visibleListings.length) {
    return (
      <div className="state-panel empty-feed directory-empty-state">
        <h3>{emptyLabel}</h3>
      </div>
    );
  }

  return (
    <div className="directory-results-layout">
      <div className="directory-list-column">
        <div className="listing-grid">
          {visibleListings.map((listing) => (
            <ListingCard
              key={listing.id}
              listing={listing}
              locale={locale}
              selected={listing.id === selected?.id}
              onSelect={(event) => {
                if (!window.matchMedia("(min-width: 1180px)").matches) return;
                event.preventDefault();
                setSelectedId(listing.id);
              }}
            />
          ))}
        </div>
        {children}
      </div>
      {selected && (
        <DesktopListingPreviewInteractive listing={selected} locale={locale} />
      )}
    </div>
  );
}
