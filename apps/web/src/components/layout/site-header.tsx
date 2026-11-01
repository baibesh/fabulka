"use client";

import { BookHeart, Library, Wand2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/i18n/i18n";
import type { MessageKey } from "@/i18n/messages";
import { AuthMenu, AuthNotice } from "../account/auth-menu";
import { LanguagePicker } from "./locale-pickers";
import { Logo } from "./logo";

const NAV: { href: string; label: MessageKey; icon: typeof Library; testId: string }[] = [
  { href: "/catalog", label: "nav.catalog", icon: Library, testId: "nav-catalog" },
  { href: "/create", label: "nav.create", icon: Wand2, testId: "nav-create" },
  { href: "/my", label: "nav.my", icon: BookHeart, testId: "nav-my" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const { t } = useI18n();
  return (
    <>
      <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center gap-0.5 px-4 sm:gap-2">
          <Link href="/" data-testid="nav-home" aria-label={t("nav.home")} className="mr-auto">
            <Logo />
          </Link>
          <nav className="flex items-center sm:gap-1">
            {NAV.map(({ href, label, icon: Icon, testId }) => {
              const active = pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  data-testid={testId}
                  aria-label={t(label)}
                  className={`flex items-center gap-1.5 rounded-xl px-1.5 py-2 text-sm font-semibold sm:px-3 ${
                    active ? "bg-accent/15 text-accent" : "text-muted hover:text-foreground"
                  }`}
                >
                  <Icon className="size-4" />
                  <span className="hidden md:inline">{t(label)}</span>
                </Link>
              );
            })}
          </nav>
          {/* Only the languages offered in the chosen country; the country itself is in the footer. */}
          <LanguagePicker />
          <AuthMenu pathname={pathname} />
        </div>
      </header>
      <AuthNotice />
    </>
  );
}
