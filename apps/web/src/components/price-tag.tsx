"use client";

import type { BookKind } from "@fabulka/shared";
import { useI18n } from "@/i18n/i18n";
import { useBookPrice } from "@/lib/use-price";
import { PriceSkeleton } from "./price-skeleton";

/** What one more book of this kind costs, for the header of its page. */
export function PriceTag({ kind }: { kind: BookKind }) {
  const { t } = useI18n();
  const price = useBookPrice(kind);
  return (
    <p data-testid="book-price" className="flex flex-wrap items-center gap-2 text-sm">
      <span className="rounded-full bg-accent px-3 py-1 font-extrabold text-accent-foreground">{price ?? <PriceSkeleton />}</span>
      <span className="text-muted">{t("price.afterFree")}</span>
    </p>
  );
}
