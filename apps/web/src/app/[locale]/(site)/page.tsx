import type { Metadata } from "next";
import { MotionConfig } from "motion/react";
import { Suspense } from "react";
import { Examples } from "@/components/catalog/examples";
import { CountryData } from "@/components/layout/country-data";
import { CatalogPreview } from "@/components/landing/catalog-preview";
import { Faq } from "@/components/landing/faq";
import { FinalCta } from "@/components/landing/final-cta";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { LiveExample } from "@/components/landing/live-example";
import { Methods } from "@/components/landing/methods";
import { Pricing } from "@/components/landing/pricing";
import { ToyStory } from "@/components/landing/toy-story";
import { TrustStrip } from "@/components/landing/trust-strip";
import type { UiLocale } from "@/i18n/messages";
import { SiteJsonLd } from "@/components/seo/json-ld";
import { pageMetadata } from "@/lib/seo-data";

export async function generateMetadata({ params }: PageProps<"/[locale]">): Promise<Metadata> {
  return pageMetadata((await params).locale as UiLocale, "home");
}

export default async function Home({ params }: PageProps<"/[locale]">) {
  const locale = (await params).locale as UiLocale;
  // Prices, the catalog strip, the examples and the FAQ follow the visitor's country (a cookie), so
  // the landing renders at request time; the prerendered shell is the same page before that data.
  return (
    <MotionConfig reducedMotion="user">
      <SiteJsonLd locale={locale} />
      <Suspense fallback={<Landing />}>
        <CountryData locale={locale} need={["templates", "examples", "methodologies"]}>
          <Landing />
        </CountryData>
      </Suspense>
    </MotionConfig>
  );
}

function Landing() {
  return (
    <main className="flex w-full flex-col">
      <Hero />
      <TrustStrip />
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-20 px-4 py-16 sm:gap-24">
        <HowItWorks />
        <LiveExample />
        <Examples />
        <ToyStory />
        <CatalogPreview />
        <Methods />
        <Pricing />
        <Faq />
      </div>
      <FinalCta />
    </main>
  );
}
