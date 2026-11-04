import type { Metadata } from "next";
import { DEFAULT_LANGUAGE } from "@fabulka/shared";
import { siteMetadata } from "@/lib/seo";
import { Document } from "../document";
import { Providers } from "../providers";

export const metadata: Metadata = {
  ...siteMetadata,
  title: "Admin - Fabulka",
  robots: { index: false, follow: false },
};

/**
 * The admin's root layout: no language in its address; it keeps its own language switch. The server
 * renders it in the default language (English), the language it opens in until switched.
 */
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <Document lang={DEFAULT_LANGUAGE}>
      <Providers>{children}</Providers>
    </Document>
  );
}
