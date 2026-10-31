"use client";

import { ArrowRight, Wand2 } from "lucide-react";
import Link from "next/link";
import { LogoMark } from "@/components/logo";
import { useI18n } from "@/i18n/i18n";

/** The last call to start, in a warm band above the footer. */
export function FinalCta() {
  const { t } = useI18n();
  return (
    <section data-testid="final-cta" className="bg-accent text-accent-foreground">
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-5 px-4 py-14 text-center">
        <div aria-hidden className="animate-float rounded-[27%] shadow-lg ring-4 ring-white/80">
          <LogoMark className="block size-20 sm:size-24" />
        </div>
        <h2 className="max-w-2xl text-3xl font-extrabold leading-tight sm:text-4xl">{t("landing.final.title")}</h2>
        <p className="max-w-xl text-lg font-semibold">{t("landing.final.text")}</p>
        <div className="flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
          <Link
            href="/catalog"
            className="flex items-center justify-center gap-2 rounded-xl bg-card px-6 py-3.5 text-lg font-bold text-accent shadow-sm transition hover:brightness-105"
          >
            {t("landing.hero.cta")}
            <ArrowRight className="size-5" />
          </Link>
          <Link
            href="/create"
            className="flex items-center justify-center gap-2 rounded-xl border-2 border-accent-foreground/70 px-6 py-3 text-lg font-bold transition hover:bg-white/10"
          >
            <Wand2 className="size-5" />
            {t("catalog.own.title")}
          </Link>
        </div>
      </div>
    </section>
  );
}
