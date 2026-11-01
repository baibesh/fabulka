"use client";

import { BookOpen, Compass, Globe, Heart, Repeat, School, Sprout } from "lucide-react";
import { useI18n } from "@/i18n/i18n";
import { useMethodologies } from "@/lib/use-methodologies";
import { Section } from "./section";
import { Badge } from "../ui/badge";
import { Skeleton } from "../ui/skeleton";

/** Icons of the methods the service started with; one added in the admin gets the book. */
const ICONS: Record<string, typeof Heart> = {
  "toddler-routine": Repeat,
  "social-story": School,
  "sel-emotions": Heart,
  "growth-mindset": Sprout,
  "mirrors-windows": Globe,
  "adventure-quest": Compass,
};

/** Cards shown while the methods load, so the section does not jump when they arrive. */
const PLACEHOLDERS = 6;

/** Every story method a book can follow, with the ages it suits. */
export function Methods() {
  const { t } = useI18n();
  const { data: methods, isError } = useMethodologies();
  // Without the methods there is nothing to tell; the rest of the page goes on.
  if (isError) return null;
  return (
    <Section testId="methods" title={t("landing.methods.title")} lead={t("landing.methods.lead")}>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy={!methods}>
        {!methods &&
          Array.from({ length: PLACEHOLDERS }, (_, i) => (
            <li key={i} className="flex h-36 gap-4 rounded-3xl border border-border bg-card p-5">
              <Skeleton radius="lg" className="size-11 shrink-0" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton radius="full" className="h-4 w-16" />
                <Skeleton className="h-3 w-full" />
              </div>
            </li>
          ))}
        {methods?.map((m) => {
          const Icon = ICONS[m.slug] ?? BookOpen;
          return (
            <li key={m.slug} className="flex gap-4 rounded-3xl border border-border bg-card p-5">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent/15 text-accent">
                <Icon className="size-5" />
              </span>
              <div className="flex flex-col gap-1.5">
                <h3 className="font-extrabold leading-snug">{m.name}</h3>
                <Badge className="self-start">{t("common.years", { min: m.ageMin, max: m.ageMax })}</Badge>
                <p className="text-sm text-muted">{m.summary}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
