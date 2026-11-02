"use client";

import { localePath, splitLocalePath } from "@fabulka/shared";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, type ComponentProps } from "react";
import { useI18n } from "./i18n";

export { localePath, splitLocalePath };

/**
 * The page's path without its language: `/catalog` on /catalog, /ru/catalog and on the /en/catalog
 * the server renders an English (default language) page as, so it is the same while hydrating and
 * after.
 */
export function useBarePath(): string {
  return splitLocalePath(usePathname() ?? "/").path;
}

/**
 * A site link in the page's language: `<LocaleLink href="/catalog">` goes to /catalog on an English
 * page and to /ru/catalog on a Russian one. Hashes, other sites and the admin stay as they are.
 */
export function LocaleLink({ href, ...rest }: Omit<ComponentProps<typeof Link>, "href"> & { href: string }) {
  const { locale } = useI18n();
  return <Link href={localePath(locale, href)} {...rest} />;
}

/** useRouter, with push and replace taking site paths in the page's language. */
export function useLocaleRouter() {
  const router = useRouter();
  const { locale } = useI18n();
  return useMemo(
    () => ({
      push: (path: string) => router.push(localePath(locale, path)),
      replace: (path: string) => router.replace(localePath(locale, path)),
    }),
    [router, locale],
  );
}
