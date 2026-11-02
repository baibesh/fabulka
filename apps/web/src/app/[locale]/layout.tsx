import { isLanguage } from "@fabulka/shared";
import { notFound } from "next/navigation";
import { UI_LOCALES } from "@/i18n/messages";
import { siteMetadata } from "@/lib/seo";
import { Document } from "../document";
import { Providers } from "../providers";

export const metadata = siteMetadata;

/** Every language is prerendered; the proxy serves Russian at unprefixed addresses (src/proxy.ts). */
export function generateStaticParams() {
  return UI_LOCALES.map((locale) => ({ locale }));
}

export default async function SiteRootLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLanguage(locale)) notFound();
  return (
    <Document lang={locale}>
      <Providers locale={locale}>{children}</Providers>
    </Document>
  );
}
