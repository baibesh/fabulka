import type { Metadata } from "next";
import { NotFoundContent } from "@/components/layout/not-found-content";
import { Document } from "./document";
import { Providers } from "./providers";

export const metadata: Metadata = { title: "404 · Fabulka" };

/**
 * Any address that matches no page: an unknown language segment (/fr/…), a typo. The site has two
 * root layouts ([locale] and admin), so this one brings its own <html>; it is in Russian, the
 * language of the unprefixed site.
 */
export default function GlobalNotFound() {
  return (
    <Document lang="ru">
      <Providers>
        <NotFoundContent />
      </Providers>
    </Document>
  );
}
