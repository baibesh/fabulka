import type { Metadata } from "next";
import { MotionConfig } from "motion/react";
import { Examples } from "@/components/examples";
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

export const metadata: Metadata = {
  title: { absolute: "Fabulka — персональная детская книга, где ваш ребёнок главный герой" },
  description:
    "Сказка по методике детского развития, где ребёнок узнаёт себя на каждой иллюстрации. PDF за несколько минут, а в Казахстане — печать и доставка. Первые книги — бесплатно.",
};

export default function Home() {
  return (
    <MotionConfig reducedMotion="user">
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
    </MotionConfig>
  );
}
