"use client";

import { LANGUAGES } from "@fabulka/shared";
import { Brain, Languages, ShieldCheck, Truck } from "lucide-react";
import { useI18n } from "@/i18n/i18n";
import { useMethodologies } from "@/lib/use-methodologies";

/** Four short reasons to trust a book about your child, in a band under the hero. */
export function TrustStrip() {
  const { t } = useI18n();
  // The number of published methods once it is known; until then (or if it cannot be read), no number.
  const { data: methods } = useMethodologies();
  const items = [
    {
      icon: Brain,
      text: methods?.length ? t("landing.trust.methods", { count: methods.length }) : t("landing.trust.methods.any"),
    },
    { icon: Languages, text: t("landing.trust.languages", { count: LANGUAGES.length }) },
    { icon: Truck, text: t("landing.trust.print") },
    { icon: ShieldCheck, text: t("landing.trust.data") },
  ];
  return (
    <section data-testid="trust" className="border-y border-border bg-card">
      <ul className="mx-auto grid w-full max-w-5xl grid-cols-2 gap-x-4 gap-y-5 px-4 py-6 md:grid-cols-4">
        {items.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-center gap-3 text-sm font-semibold sm:text-base">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
              <Icon className="size-5" />
            </span>
            {text}
          </li>
        ))}
      </ul>
    </section>
  );
}
