"use client";

import { useQuery } from "@tanstack/react-query";
import type { AdminPermission } from "@fabulka/shared";
import { BookOpen, GraduationCap, History, LayoutDashboard, Library, ListChecks, LogOut, Package, ScrollText, Palette, Search, ShieldAlert, Sparkles, TriangleAlert, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import type { MessageKey } from "@/i18n/messages";
import { adminLogout, adminMe } from "@/lib/admin-api";
import { logout as signOut } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { LanguagePicker } from "@/components/layout/locale-pickers";
import { ReloadButton } from "@/components/layout/new-version";
import { COUNTRY_PARAM, withCountry } from "@/lib/admin-country";
import { useAdminI18n } from "./ui";
import { useWorkingCountry, WorkingCountryNotice, WorkingCountryProvider, WorkingCountrySwitcher } from "./working-country";

type NavItem = { href: string; label: MessageKey; icon: typeof BookOpen; permission: AdminPermission };

/** The admin's sections; each is a permission (the roles in Team say who opens it; /admin/me lists them). */
const NAV: NavItem[] = [
  { href: "/admin", label: "admin.nav.dashboard", icon: LayoutDashboard, permission: "dashboard" },
  { href: "/admin/books", label: "admin.nav.books", icon: BookOpen, permission: "books" },
  { href: "/admin/orders", label: "admin.nav.orders", icon: Package, permission: "orders" },
  { href: "/admin/catalog", label: "admin.nav.catalog", icon: Library, permission: "catalog" },
  { href: "/admin/examples", label: "admin.nav.examples", icon: Sparkles, permission: "examples" },
  { href: "/admin/methodologies", label: "admin.nav.methodologies", icon: GraduationCap, permission: "methodologies" },
  { href: "/admin/themes", label: "admin.nav.themes", icon: Palette, permission: "themes" },
  { href: "/admin/reference", label: "admin.nav.reference", icon: ListChecks, permission: "reference" },
  { href: "/admin/journal", label: "admin.nav.journal", icon: ScrollText, permission: "journal" },
  { href: "/admin/activity", label: "admin.nav.audit", icon: History, permission: "audit" },
  { href: "/admin/seo", label: "admin.nav.seo", icon: Search, permission: "seo" },
  { href: "/admin/team", label: "admin.nav.team", icon: Users, permission: "team" },
];

/** The section a path belongs to: the nav entry whose address it is or is under. */
export function sectionOf(pathname: string): AdminPermission {
  const found = NAV.filter(({ href }) => href !== "/admin").find(({ href }) => pathname === href || pathname.startsWith(`${href}/`));
  return found?.permission ?? "dashboard";
}

/**
 * The admin frame: checks the session, then shows the sidebar with the sections the roles open and
 * the page, or a 403 view for a section they do not (the API refuses it too).
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const { t } = useAdminI18n();
  const me = useQuery({ queryKey: ["admin", "me"], queryFn: adminMe, retry: false });
  const signedOut = me.error instanceof ApiError && me.error.status === 401;

  const permissions = me.data?.permissions;
  const nav = NAV.filter(({ permission }) => permissions?.includes(permission));
  const section = sectionOf(pathname);
  const allowed = permissions?.includes(section) ?? false;
  // The dashboard is someone else's first page: a role without it starts on its first section.
  const start = section === "dashboard" && pathname === "/admin" && permissions && !allowed ? nav[0]?.href : undefined;

  useEffect(() => {
    if (signedOut) router.replace("/admin/login");
  }, [signedOut, router]);
  useEffect(() => {
    // The working country in the address comes along.
    if (start) router.replace(withCountry(start, search.get(COUNTRY_PARAM)));
  }, [start, router, search]);

  // A failed refetch (the window came back into focus) keeps the admin on the session it had.
  if (!me.data) return me.isError && !signedOut ? <AdminFailed error={me.error} /> : <p className="p-8 text-muted">{t("admin.loading")}</p>;

  // Leaving the admin signs out of the site too (and of Keycloak), then lands on the home page.
  const logout = async () => {
    await adminLogout().catch(() => undefined);
    await signOut();
  };

  return (
    <WorkingCountryProvider me={me.data}>
      <div className="flex min-h-screen flex-col md:flex-row">
        <aside className="flex shrink-0 gap-1 border-b border-border bg-card p-3 md:sticky md:top-0 md:h-screen md:w-56 md:flex-col md:overflow-y-auto md:border-r md:border-b-0 md:p-4">
          <p className="hidden px-3 pb-4 text-sm font-extrabold uppercase tracking-widest text-accent md:block">{t("admin.title")}</p>
          <AdminNav items={nav} pathname={pathname} />
          <WorkingCountrySwitcher className="w-40 self-center md:mx-1 md:mb-2 md:w-auto md:self-stretch" />
          <LanguagePicker scope="admin" testId="admin-language" optionPrefix="admin-lang-" className="self-center md:mx-1 md:mb-2 md:self-start" />
          <button
            type="button"
            data-testid="admin-logout"
            aria-label={t("admin.logout")}
            onClick={() => void logout()}
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted hover:text-foreground"
          >
            <LogOut className="size-4" />
            <span className="hidden md:inline">{t("admin.logout")}</span>
          </button>
        </aside>
        <main data-density="compact" className="flex min-w-0 flex-1 flex-col gap-6 p-4 md:p-8">
          <WorkingCountryNotice />
          {allowed ? children : start ? <p className="text-muted">{t("admin.loading")}</p> : <Forbidden home={nav[0]?.href} />}
        </main>
      </div>
    </WorkingCountryProvider>
  );
}

/** The sections' links, each keeping the working country so moving between them keeps it. */
function AdminNav({ items, pathname }: { items: NavItem[]; pathname: string }) {
  const { t } = useAdminI18n();
  const { href: keep } = useWorkingCountry();
  return (
    <nav className="flex flex-1 gap-1 overflow-x-auto md:flex-col">
      {items.map(({ href, label, icon: Icon }) => {
        const active = href === "/admin" ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={keep(href)}
            data-testid={`admin-nav-${href.split("/")[2] ?? "dashboard"}`}
            className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold whitespace-nowrap ${
              active ? "bg-accent/15 text-accent" : "text-muted hover:text-foreground"
            }`}
          >
            <Icon className="size-4" />
            {t(label)}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * The session check failed (not a sign-out): what went wrong in words, never a raw zod dump (a page
 * older than the API gets "out of date", see lib/outdated), and a reload.
 */
function AdminFailed({ error }: { error: Error }) {
  const { t } = useAdminI18n();
  return (
    <div data-testid="admin-failed" role="alert" className="flex max-w-lg flex-col items-start gap-3 p-8">
      <TriangleAlert className="size-10 text-danger" />
      <h1 className="text-2xl font-extrabold">{t("admin.error.title")}</h1>
      <p className="text-muted">{error.message || t("update.outdated")}</p>
      <ReloadButton />
    </div>
  );
}

/** A section the signed-in roles do not open: 403, with the way to one they do. */
function Forbidden({ home }: { home?: string }) {
  const { t } = useAdminI18n();
  const { href } = useWorkingCountry();
  return (
    <div data-testid="admin-forbidden" className="flex max-w-lg flex-col items-start gap-3 py-12">
      <ShieldAlert className="size-10 text-warning" />
      <p className="text-sm font-bold uppercase tracking-widest text-muted">403</p>
      <h1 className="text-2xl font-extrabold">{t("admin.forbidden.title")}</h1>
      <p className="text-muted">{t("admin.forbidden.text")}</p>
      {home && (
        <Link href={href(home)} data-testid="admin-forbidden-home" className="font-semibold text-accent hover:underline">
          {t("admin.forbidden.back")}
        </Link>
      )}
    </div>
  );
}
