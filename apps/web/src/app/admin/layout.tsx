import type { Metadata } from "next";
import { siteMetadata } from "@/lib/seo";
import { Document } from "../document";
import { Providers } from "../providers";

export const metadata: Metadata = {
  ...siteMetadata,
  title: "Админка — Fabulka",
  robots: { index: false, follow: false },
};

/** The admin's root layout: no language in its address; it keeps its own language switch. */
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <Document lang="ru">
      <Providers>{children}</Providers>
    </Document>
  );
}
