"use client";

import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  Brush,
  Building2,
  ChartColumn,
  Eye,
  FileCheck2,
  GraduationCap,
  Grid3x3,
  History,
  Inbox,
  LayoutGrid,
  Library,
  LogOut,
  Menu as MenuIcon,
  MessageCircleQuestion,
  Package,
  Palette,
  Printer,
  Receipt,
  ScrollText,
  Search,
  Settings,
  ShieldAlert,
  Sparkles,
  Store,
  TriangleAlert,
  Users,
  Workflow,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { adminLogout, adminMe } from "@/lib/admin-api";
import { activeEntry, canOpen, navFor, type NavGroup, type NavIcon } from "@/lib/admin-workspace";
import { logout as signOut } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { LanguagePicker } from "@/components/layout/locale-pickers";
import { ReloadButton } from "@/components/layout/new-version";
import { cx } from "@/components/ui/cx";
import { CommandPalette, ShortcutHint, usePaletteShortcut } from "./command-palette";
import { ColorToggle } from "./color-toggle";
import { useAdminI18n } from "./ui";
import { useWorkingCountry, WorkingCountryNotice, WorkingCountryProvider } from "./working-country";
import { WorkspaceSwitcher } from "./workspace-switcher";

/** The menu's icons. */
const ICONS: Record<NavIcon, typeof BookOpen> = {
  inbox: Inbox,
  overview: ChartColumn,
  orders: Package,
  books: BookOpen,
  journal: ScrollText,
  catalog: Library,
  methods: GraduationCap,
  formats: LayoutGrid,
  pipeline: Workflow,
  themes: Palette,
  references: Brush,
  seo: Search,
  faq: MessageCircleQuestion,
  examples: Sparkles,
  matrix: Grid3x3,
  team: Users,
  activity: History,
  settings: Settings,
  consent: FileCheck2,
  landing: Store,
  prices: Receipt,
  print: Printer,
  cities: Building2,
  preview: Eye,
};

/**
 * The admin frame: checks the session, then shows the workspace switcher, the workspace's menu (the
 * sections the roles open there) and the page, or a 403 view for a page they do not (the API
 * refuses it too). Cmd+K (Ctrl+K) opens the command palette anywhere.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { t } = useAdminI18n();
  const me = useQuery({ queryKey: ["admin", "me"], queryFn: adminMe, retry: false });
  const signedOut = me.error instanceof ApiError && me.error.status === 401;

  useEffect(() => {
    if (signedOut) router.replace("/admin/login");
  }, [signedOut, router]);

  // A failed refetch (the window came back into focus) keeps the admin on the session it had.
  if (!me.data) return me.isError && !signedOut ? <AdminFailed error={me.error} /> : <p className="p-8 text-muted">{t("admin.loading")}</p>;

  return (
    <WorkingCountryProvider me={me.data}>
      <Frame>{children}</Frame>
    </WorkingCountryProvider>
  );
}

function Frame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { t } = useAdminI18n();
  const { access, country, href } = useWorkingCountry();
  const groups = useMemo(() => navFor(access, country), [access, country]);
  const allowed = canOpen(access, pathname);
  const [palette, setPalette] = useState(false);
  const openPalette = useCallback(() => setPalette(true), []);
  usePaletteShortcut(openPalette);

  // On a phone the menu folds under the header and closes once a page is picked.
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPath, setMenuPath] = useState(pathname);
  if (menuPath !== pathname) {
    setMenuPath(pathname);
    setMenuOpen(false);
  }

  // Leaving the admin signs out of the site too (and of Keycloak), then lands on the home page.
  const logout = async () => {
    await adminLogout().catch(() => undefined);
    await signOut();
  };

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside
        data-testid="admin-sidebar"
        className="z-20 flex shrink-0 flex-col border-b border-border bg-card md:sticky md:top-0 md:h-screen md:w-64 md:border-r md:border-b-0"
      >
        <div className="flex items-center gap-1 p-3">
          <div className="min-w-0 flex-1">
            <WorkspaceSwitcher />
          </div>
          <button
            type="button"
            data-testid="palette-open-icon"
            aria-label={t("admin.palette.open")}
            onClick={() => setPalette(true)}
            className="rounded-xl p-2 text-muted hover:text-foreground md:hidden"
          >
            <Search className="size-5" />
          </button>
          <button
            type="button"
            data-testid="admin-menu-toggle"
            aria-label={t("admin.ws.menu")}
            aria-expanded={menuOpen}
            aria-controls="admin-menu"
            onClick={() => setMenuOpen((open) => !open)}
            className="rounded-xl p-2 text-muted hover:text-foreground md:hidden"
          >
            {menuOpen ? <X className="size-5" /> : <MenuIcon className="size-5" />}
          </button>
        </div>
        <div id="admin-menu" className={cx("min-h-0 flex-1 flex-col gap-3 px-3 pb-3 md:flex", menuOpen ? "flex" : "hidden")}>
          <button
            type="button"
            data-testid="palette-open"
            onClick={() => setPalette(true)}
            className="hidden items-center gap-2 rounded-xl border border-border px-3 py-1.5 text-sm text-muted hover:border-accent hover:text-foreground md:flex"
          >
            <Search className="size-4" />
            <span className="flex-1 text-left">{t("admin.palette.open")}</span>
            <ShortcutHint />
          </button>
          <AdminNav groups={groups} pathname={pathname} href={href} />
          <div className="flex flex-col gap-1 border-t border-border pt-3">
            <div className="mx-1 mb-1 flex items-center gap-2">
              <LanguagePicker scope="admin" testId="admin-language" optionPrefix="admin-lang-" className="self-start" />
              <ColorToggle />
            </div>
            <button
              type="button"
              data-testid="admin-logout"
              aria-label={t("admin.logout")}
              onClick={() => void logout()}
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted hover:text-foreground"
            >
              <LogOut className="size-4" />
              {t("admin.logout")}
            </button>
          </div>
        </div>
      </aside>
      <main data-density="compact" className="flex min-w-0 flex-1 flex-col gap-6 p-4 md:p-8">
        <WorkingCountryNotice />
        {allowed ? children : <Forbidden home="/admin" />}
      </main>
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
    </div>
  );
}

/** The workspace's menu: groups under small headings, each link keeping the workspace. */
function AdminNav({ groups, pathname, href }: { groups: NavGroup[]; pathname: string; href: (path: string) => string }) {
  const { t } = useAdminI18n();
  const active = activeEntry(groups, pathname);
  return (
    <nav data-testid="admin-nav" aria-label={t("admin.ws.menu")} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
      {groups.map((group) => (
        <div key={group.id} data-testid={`admin-nav-group-${group.id}`} className="flex flex-col gap-0.5">
          {group.label && <p className="px-3 pb-1 text-[11px] font-bold uppercase tracking-widest text-muted">{t(group.label)}</p>}
          {group.items.map((entry) => {
            const Icon = ICONS[entry.icon];
            const current = active?.id === entry.id && active.href === entry.href;
            return (
              <Link
                key={entry.id}
                href={href(entry.href)}
                data-testid={`admin-nav-${entry.id}`}
                aria-current={current ? "page" : undefined}
                className={cx(
                  "flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-semibold whitespace-nowrap",
                  current ? "bg-accent/15 text-accent" : "text-muted hover:bg-accent/5 hover:text-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" />
                {t(entry.label)}
              </Link>
            );
          })}
        </div>
      ))}
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

/** A page the signed-in roles do not open: 403, with the way back to the Inbox. */
function Forbidden({ home }: { home: string }) {
  const { t } = useAdminI18n();
  const { href } = useWorkingCountry();
  return (
    <div data-testid="admin-forbidden" className="flex max-w-lg flex-col items-start gap-3 py-12">
      <ShieldAlert className="size-10 text-warning" />
      <p className="text-sm font-bold uppercase tracking-widest text-muted">403</p>
      <h1 className="text-2xl font-extrabold">{t("admin.forbidden.title")}</h1>
      <p className="text-muted">{t("admin.forbidden.text")}</p>
      <Link href={href(home)} data-testid="admin-forbidden-home" className="font-semibold text-accent hover:underline">
        {t("admin.forbidden.back")}
      </Link>
    </div>
  );
}
