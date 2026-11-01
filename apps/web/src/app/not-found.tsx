import Link from "next/link";
import { Logo } from "@/components/layout/logo";
import { T } from "@/i18n/t";
import { buttonClass } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6 text-center">
      <Logo />
      <p className="text-6xl font-extrabold text-accent">404</p>
      <p className="text-lg text-muted">
        <T k="notFound.text" />
      </p>
      <Link href="/catalog" className={buttonClass()}>
        <T k="notFound.cta" />
      </Link>
    </main>
  );
}
