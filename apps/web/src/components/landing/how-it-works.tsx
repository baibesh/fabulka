"use client";

import { COUNTRY_INFO } from "@fabulka/shared";
import { Clock3, Library, MessageCircleHeart, Printer } from "lucide-react";
import { motion } from "motion/react";
import { useI18n } from "@/i18n/i18n";
import { Section } from "./section";

/** From picking a story to a printed book, in four steps. */
export function HowItWorks() {
  const { t, country } = useI18n();
  const steps = [
    { icon: Library, title: t("landing.how.choose.title"), text: t("landing.how.choose.text") },
    { icon: MessageCircleHeart, title: t("landing.how.tell.title"), text: t("landing.how.tell.text") },
    { icon: Clock3, title: t("landing.how.ready.title"), text: t("landing.how.ready.text") },
    {
      icon: Printer,
      title: t("landing.how.print.title"),
      // Print is only in Kazakhstan; elsewhere the step says so instead of promising delivery.
      text: t(COUNTRY_INFO[country].print ? "landing.how.print.text" : "landing.how.print.elsewhere"),
    },
  ];
  return (
    <Section testId="how-it-works" title={t("landing.how.title")}>
      <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map(({ icon: Icon, title, text }, i) => (
          <motion.li
            key={title}
            data-testid="how-step"
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.45, delay: i * 0.08, ease: "easeOut" }}
            className="group flex flex-col gap-3 rounded-3xl border border-border bg-card p-5 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-accent/15 text-accent transition duration-300 group-hover:-rotate-6 group-hover:scale-110">
                <Icon className="size-6" />
              </span>
              <span className="text-3xl font-extrabold text-border">{i + 1}</span>
            </div>
            <h3 className="text-lg font-extrabold leading-snug">{title}</h3>
            <p className="text-sm text-muted">{text}</p>
          </motion.li>
        ))}
      </ol>
    </Section>
  );
}
