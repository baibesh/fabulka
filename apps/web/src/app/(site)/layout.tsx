import { Suspense } from "react";
import { Logo } from "@/components/layout/logo";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
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
      {children}
      <SiteFooter />
    </div>
  );
}
