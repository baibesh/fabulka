"use client";

import type { BookKind } from "@fabulka/shared";
import { useI18n } from "@/i18n/i18n";
import { useBookPrice } from "@/lib/use-price";
import { PriceSkeleton } from "./price-skeleton";
import { Badge } from "./ui/badge";

/** What one more book of this kind costs, for the header of its page (and, with a `label`, the wizard's review). */
export function PriceTag({ kind, label, testId = "book-price" }: { kind: BookKind; label?: string; testId?: string }) {
  const { t } = useI18n();
  const price = useBookPrice(kind);
  return (
    <p data-testid={testId} className="flex flex-wrap items-center gap-2 text-sm">
      {label && <span className="font-semibold">{label}:</span>}
      <Badge tone="solid" size="lg">
        {price ?? <PriceSkeleton />}
      </Badge>
      <span className="text-muted">{t("price.afterFree")}</span>
    </p>
  );
}
