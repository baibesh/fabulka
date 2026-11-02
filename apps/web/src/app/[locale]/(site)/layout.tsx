import { Suspense } from "react";
import { CountryData } from "@/components/layout/country-data";
import { LocaleSuggestion } from "@/components/layout/locale-suggestion";
import { Logo } from "@/components/layout/logo";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";

export default function SiteLayout({ children }: LayoutProps<"/[locale]">) {
  return (
    <div className="flex min-h-screen flex-col">
      <Suspense
        fallback={
          <div className="mx-auto flex h-16 w-full max-w-5xl items-center px-4">
            <Logo />
          </div>
        }
      >
        <SiteHeader />
      </Suspense>
      {/* Shown in the browser only (it reads the address and the browser's languages). */}
      <Suspense fallback={null}>
        <LocaleSuggestion />
      </Suspense>
      {children}
      {/* The footer names the visitor's country: the server reads it from its cookie. */}
      <Suspense fallback={<SiteFooter />}>
        <CountryData>
          <SiteFooter />
        </CountryData>
      </Suspense>
    </div>
  );
}
