import { isLanguage } from "@fabulka/shared";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Analytics } from "@/components/seo/analytics";
import { UI_LOCALES, type UiLocale } from "@/i18n/messages";
import { siteMetadata } from "@/lib/seo";
import { seoSettings } from "@/lib/seo-data";
import { OG_LOCALES, fallbackSeo } from "@/lib/seo-meta";
import { Document } from "../document";
import { Providers } from "../providers";

/**
 * What every page in a language starts from: the site's title and description in that language, and
 * the search consoles' verification tags from the admin's SEO settings. Each page sets its own.
 */
export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLanguage(locale)) return siteMetadata;
  const { title, description } = fallbackSeo(locale as UiLocale);
  const { verification } = await seoSettings();
  return {
    ...siteMetadata,
    title: { default: title, template: "%s · Fabulka" },
    description,
    openGraph: { ...siteMetadata.openGraph, title, description, locale: OG_LOCALES[locale as UiLocale] },
    verification: {
      ...(verification.google ? { google: verification.google } : {}),
      ...(verification.yandex ? { yandex: verification.yandex } : {}),
      ...(verification.bing ? { other: { "msvalidate.01": verification.bing } } : {}),
    },
  };
}

/** Every language is prerendered; the proxy serves Russian at unprefixed addresses (src/proxy.ts). */
export function generateStaticParams() {
  return UI_LOCALES.map((locale) => ({ locale }));
}

export default async function SiteRootLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLanguage(locale)) notFound();
  // Analytics ids from the admin's SEO settings; the scripts load only after the visitor consents.
  const { analytics } = await seoSettings();
  return (
    <Document lang={locale}>
      <Providers locale={locale}>
        {children}
        <Analytics analytics={analytics} />
      </Providers>
    </Document>
  );
}
