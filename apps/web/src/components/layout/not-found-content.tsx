import { buttonClass } from "@/components/ui/button";
import { LocaleLink } from "@/i18n/routing";
import { T } from "@/i18n/t";
import { Logo } from "./logo";

/** The 404 screen: the site's (in the page's language) and the global one (in the default language). */
export function NotFoundContent() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6 text-center">
      <Logo />
      <p className="text-6xl font-extrabold text-accent">404</p>
      <p className="text-lg text-muted">
        <T k="notFound.text" />
      </p>
      <LocaleLink href="/catalog" className={buttonClass()}>
        <T k="notFound.cta" />
      </LocaleLink>
    </main>
  );
}
