"use client";

import { useQuery } from "@/lib/query";
import { ArrowRight, BookOpen, CirclePause } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useI18n } from "@/i18n/i18n";
import { getStatus, listExamples, listTemplates } from "@/lib/api";
import { useBookPrice } from "@/lib/use-price";
import { PriceSkeleton } from "../book/price-skeleton";
import { LogoMark } from "@/components/layout/logo";
import { primaryButton, secondaryButton } from "./section";

/** Where each cover of the collage lies: a loose, slightly fanned pile. */
const PILE = [
  "left-0 top-[6%] w-[54%] -rotate-6",
  "right-0 top-0 w-[54%] rotate-6",
  "left-[22%] bottom-0 z-10 w-[58%] -rotate-1",
];

/**
 * Where each cover starts: stacked upright in the middle, from where it fans out to its place in the
 * pile (the Tailwind rotation above stays; these offsets undo it at the start). Covers are fully
 * shown within half a second, as tests and impatient visitors look for them right away.
 */
const DEAL = [
  { x: "38%", y: 10, rotate: 6 },
  { x: "-38%", y: 18, rotate: -6 },
  { x: 0, y: 28, rotate: 1 },
];

/** Little stars twinkling around the pile, each on its own beat. */
const SPARKLES = [
  "left-[4%] top-[-4%] size-6 [animation-delay:0s]",
  "right-[-2%] top-[46%] size-5 [animation-delay:0.9s]",
  "left-[46%] top-[-8%] size-4 [animation-delay:1.7s]",
];

/** The headline, what Fabulka does, the way in, and a pile of catalog covers. */
export function Hero() {
  const { t, country, info } = useI18n();
  // Print and delivery are promised only where there is print; Kazakhstan's line names it.
  const lead = info.print ? (country === "KZ" ? "landing.hero.lead" : "landing.hero.lead.print") : "landing.hero.lead.pdf";
  const { data: examples } = useQuery({ queryKey: ["examples"], queryFn: listExamples });
  const paused = useQuery({ queryKey: ["status"], queryFn: getStatus }).data?.paused === true;
  const price = useBookPrice("template");

  return (
    <section data-testid="hero" className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute -top-48 right-[-10rem] size-[36rem] rounded-full bg-accent/15 blur-3xl" />
      <div className="relative mx-auto grid w-full max-w-5xl items-center gap-10 px-4 pt-10 pb-14 sm:pt-16 md:grid-cols-[1.15fr_1fr] md:pb-20">
        <div className="flex flex-col gap-5">
          {paused && (
            // New books are paused: say so before the parent picks a story, and point at the examples.
            <a
              href="#examples"
              data-testid="hero-paused"
              className="flex items-center gap-2 self-start rounded-full border border-accent/40 bg-card px-3 py-1.5 text-sm font-semibold"
            >
              <CirclePause className="size-4 shrink-0 text-accent" />
              {t("form.paused.title")}
            </a>
          )}
          <h1 className="text-4xl font-extrabold leading-tight sm:text-5xl">{t("landing.hero.title")}</h1>
          <p className="text-lg text-muted sm:text-xl">{t(lead)}</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link href="/catalog" data-testid="hero-cta" className={primaryButton}>
              {t("landing.hero.cta")}
              <ArrowRight className="size-5" />
            </Link>
            {Boolean(examples?.length) && (
              <a href="#example" data-testid="hero-example" className={secondaryButton}>
                <BookOpen className="size-5" />
                {t("landing.hero.example")}
              </a>
            )}
          </div>
          <p className="text-sm text-muted">{price ? t("landing.hero.price", { price }) : <PriceSkeleton className="w-72 max-w-full" />}</p>
        </div>
        <Covers />
      </div>
    </section>
  );
}

/** Covers of the first catalog books. They arrive from the API once the page is running. */
function Covers() {
  const { locale } = useI18n();
  const { data: templates } = useQuery({ queryKey: ["templates", locale], queryFn: () => listTemplates(locale) });
  const covers = templates?.filter((book) => book.coverUrl).slice(0, PILE.length) ?? [];

  return (
    <div className="relative mx-auto aspect-square w-full max-w-sm md:max-w-md">
      {covers.length > 0 && (
        <ul data-testid="hero-covers" className="absolute inset-0">
          {covers.map((book, i) => (
            <motion.li
              key={book.slug}
              initial={{ opacity: 0, scale: 0.92, ...DEAL[i] }}
              animate={{ opacity: 1, scale: 1, x: 0, y: 0, rotate: 0 }}
              transition={{
                default: { type: "spring", stiffness: 160, damping: 18, delay: i * 0.06 },
                opacity: { duration: 0.2, delay: i * 0.06 },
              }}
              className={`absolute ${PILE[i]}`}
            >
              <Link
                href={`/catalog/${book.slug}`}
                aria-label={book.title}
                className="block overflow-hidden rounded-2xl border-4 border-card shadow-xl transition duration-300 hover:-translate-y-1.5 hover:scale-[1.03] hover:shadow-2xl"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- covers are static files of any size */}
                <img src={book.coverUrl!} alt="" className="aspect-square w-full object-cover" />
              </Link>
            </motion.li>
          ))}
        </ul>
      )}
      {SPARKLES.map((place) => (
        <svg key={place} viewBox="0 0 24 24" aria-hidden className={`animate-twinkle pointer-events-none absolute z-20 text-accent ${place}`}>
          <path d="M12 0l3.2 8.8L24 12l-8.8 3.2L12 24l-3.2-8.8L0 12l8.8-3.2z" fill="currentColor" />
        </svg>
      ))}
      {/* The bookling waves from the corner of the pile. */}
      <div aria-hidden className="pointer-events-none absolute bottom-[4%] left-[-2%] z-20 -rotate-8">
        <div className="animate-float rounded-[27%] shadow-xl ring-4 ring-card">
          <LogoMark className="block size-16 sm:size-20" />
        </div>
      </div>
    </div>
  );
}
