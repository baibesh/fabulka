"use client";

import { sectionShown, type LandingSection } from "@fabulka/shared";
import type { ReactNode } from "react";
import { useI18n } from "@/i18n/i18n";
import { useReference } from "@/lib/use-price";

/** A landing section, left out where the visitor's country hides it (reference.landing). */
export function CountrySection({ id, children }: { id: LandingSection; children: ReactNode }) {
  const { country } = useI18n();
  const landing = useReference().data?.landing;
  return sectionShown(landing, country, id) ? children : null;
}
