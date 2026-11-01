"use client";

import { useI18n } from "@/i18n/i18n";
import { LEGAL } from "@/i18n/legal";

export function LegalPage({ doc }: { doc: keyof typeof LEGAL }) {
  const { locale } = useI18n();
  const page = LEGAL[doc][locale];
  return (
    <article className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-extrabold">{page.title}</h1>
        <p className="text-sm text-muted">{page.updated}</p>
      </header>
      {page.sections.map((section) => (
        <section key={section.title} className="flex flex-col gap-2">
          <h2 className="text-lg font-bold">{section.title}</h2>
          {section.text.map((paragraph) => (
            <p key={paragraph} className="leading-relaxed text-muted">
              {paragraph}
            </p>
          ))}
        </section>
      ))}
    </article>
  );
}
