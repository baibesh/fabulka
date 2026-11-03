"use client";

import { DEFAULT_LANDING_IMAGES, landingImageFor, type LandingImageSlot } from "@fabulka/shared";
import { ArrowRight } from "lucide-react";
import { useI18n } from "@/i18n/i18n";
import { useReference } from "@/lib/use-price";
import { Section } from "./section";

/** A third of the section's width. */
const STEP_SIZES = "(min-width: 1024px) 20rem, 33vw";

/**
 * The toy's way into a real example book: the parent's photo, SAM 3.1's cut-out, Muse Image's
 * drawing. The visitor's country may show its own toy (reference.landing pictures, in this language
 * or for all its languages); else the default files.
 */
export function ToyStory() {
  const { t, country, locale } = useI18n();
  const landing = useReference().data?.landing;
  const step = (slot: LandingImageSlot, label: string, fit: string) => {
    const own = landingImageFor(landing, country, locale, slot);
    return { slot, src: own?.src ?? DEFAULT_LANDING_IMAGES[slot]!, srcSet: own?.srcSet, own: Boolean(own), label, fit };
  };
  const steps = [
    step("toyPhoto", t("landing.toy.photo"), "object-cover"),
    step("toyCutout", t("landing.toy.cutout"), "object-contain p-[6%]"),
    step("toyCharacter", t("landing.toy.character"), "object-contain"),
  ];
  return (
    <Section testId="toy-story" title={t("landing.toy.title")} lead={t("landing.toy.lead")}>
      <ol className="grid grid-cols-3 items-start gap-2 sm:gap-4">
        {steps.map((step, i) => (
          <li key={step.slot} className="relative flex flex-col items-center gap-2 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- small static files, or stored ones at fixed widths */}
            <img
              data-testid={`toy-${step.slot}`}
              data-own={step.own ? "true" : "false"}
              src={step.src}
              srcSet={step.srcSet}
              sizes={step.srcSet ? STEP_SIZES : undefined}
              alt={step.label}
              loading="lazy"
              className={`aspect-square w-full rounded-2xl border border-border bg-white shadow-sm ${step.fit}`}
            />
            <span className="text-xs font-semibold text-muted sm:text-sm">{step.label}</span>
            {i < steps.length - 1 && (
              <ArrowRight
                aria-hidden
                className="absolute top-[calc(50%-1.5rem)] -right-3 z-10 size-6 rounded-full bg-accent p-1 text-accent-foreground shadow sm:-right-5 sm:size-7"
              />
            )}
          </li>
        ))}
      </ol>
    </Section>
  );
}
