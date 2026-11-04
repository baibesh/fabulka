/**
 * The admin's workspaces: "Fabulka · Global" (the whole service) and one country at a time. The
 * working country in the address (`?country=DE`, `?country=all` for Global, see admin-country.ts)
 * picks the workspace; each has its own short menu, and a page belongs to one of them or to both.
 * No React here, so the menus, the route rights and where a switch lands are unit-tested.
 */
import { allowed, allowedFor, isSuperAdmin, type AdminAccess, type AdminRight } from "@fabulka/shared";
import type { MessageKey } from "@/i18n/messages";

export type Workspace = "global" | "country";

/** The icon of a menu entry (the shell maps these to lucide icons). */
export type NavIcon =
  | "inbox"
  | "overview"
  | "orders"
  | "books"
  | "journal"
  | "catalog"
  | "methods"
  | "formats"
  | "themes"
  | "references"
  | "seo"
  | "faq"
  | "examples"
  | "matrix"
  | "team"
  | "activity"
  | "settings"
  | "consent"
  | "landing"
  | "prices"
  | "print"
  | "cities"
  | "preview";

export interface NavEntry {
  /** The menu link's test id is `admin-nav-<id>`. */
  id: string;
  href: string;
  label: MessageKey;
  icon: NavIcon;
  /** Any of these opens it (in the workspace's country, for a country menu); empty: everyone. */
  rights: readonly AdminRight[];
  /** Only the superadmin opens it (a page with no right of its own yet). */
  superOnly?: boolean;
}

export interface NavGroup {
  id: string;
  /** A small heading over the group; none for the first one. */
  label?: MessageKey;
  items: NavEntry[];
}

const INBOX: NavEntry = { id: "inbox", href: "/admin", label: "admin.ws.nav.inbox", icon: "inbox", rights: [] };

/** The global workspace: the whole service, for the superadmin and staff with global rights. */
export const GLOBAL_NAV: readonly NavGroup[] = [
  { id: "home", items: [INBOX] },
  {
    id: "operations",
    label: "admin.ws.group.operations",
    items: [
      { id: "overview", href: "/admin/overview", label: "admin.ws.nav.overview", icon: "overview", rights: ["dashboard"] },
      { id: "orders", href: "/admin/orders", label: "admin.nav.orders", icon: "orders", rights: ["orders"] },
      { id: "books", href: "/admin/books", label: "admin.nav.books", icon: "books", rights: ["books", "books.review"] },
      { id: "journal", href: "/admin/journal", label: "admin.ws.nav.journal", icon: "journal", rights: ["journal"] },
    ],
  },
  {
    id: "studio",
    label: "admin.ws.group.studio",
    // A "Pipeline" page (the generation graph) goes here when it exists.
    items: [
      { id: "catalog", href: "/admin/catalog", label: "admin.nav.catalog", icon: "catalog", rights: ["catalog"] },
      { id: "methodologies", href: "/admin/methodologies", label: "admin.nav.methodologies", icon: "methods", rights: ["methodologies", "methodologies.read"] },
      { id: "story-formats", href: "/admin/story-formats", label: "admin.nav.story_formats", icon: "formats", rights: ["story_formats", "story_formats.read"] },
      { id: "themes", href: "/admin/themes", label: "admin.nav.themes", icon: "themes", rights: ["themes", "themes.read"] },
      { id: "references", href: "/admin/references", label: "admin.nav.references", icon: "references", rights: ["references"] },
    ],
  },
  {
    id: "growth",
    label: "admin.ws.group.growth",
    items: [
      { id: "seo", href: "/admin/seo", label: "admin.nav.seo", icon: "seo", rights: ["seo"] },
      { id: "faq", href: "/admin/faq", label: "admin.ws.nav.faq", icon: "faq", rights: ["reference"] },
      { id: "examples", href: "/admin/examples", label: "admin.nav.examples", icon: "examples", rights: ["examples"] },
      { id: "matrix", href: "/admin/examples/matrix", label: "admin.ws.nav.countries", icon: "matrix", rights: ["examples"] },
    ],
  },
  {
    id: "admin",
    label: "admin.ws.group.admin",
    items: [
      { id: "team", href: "/admin/team", label: "admin.ws.nav.team", icon: "team", rights: ["team"] },
      { id: "activity", href: "/admin/activity", label: "admin.nav.audit", icon: "activity", rights: ["audit"] },
      { id: "settings", href: "/admin/settings", label: "admin.ws.nav.settings", icon: "settings", rights: ["reference", "team", "dashboard"] },
      // The consent texts page (/admin/consent) comes with the child-photo consent work.
      { id: "consent", href: "/admin/consent", label: "admin.ws.nav.consent", icon: "consent", rights: [], superOnly: true },
    ],
  },
];

/** A country's workspace: what its visitors get and its orders; a country manager's home. */
export const COUNTRY_NAV: readonly NavGroup[] = [
  { id: "home", items: [INBOX] },
  {
    id: "storefront",
    label: "admin.ws.group.storefront",
    items: [
      { id: "landing", href: "/admin/landing", label: "admin.ws.nav.landing", icon: "landing", rights: ["reference.landing"] },
      { id: "examples", href: "/admin/examples", label: "admin.nav.examples", icon: "examples", rights: ["examples"] },
      { id: "catalog", href: "/admin/catalog", label: "admin.ws.nav.samples", icon: "catalog", rights: ["catalog"] },
    ],
  },
  {
    id: "commerce",
    label: "admin.ws.group.commerce",
    items: [
      { id: "prices", href: "/admin/prices", label: "admin.ws.nav.prices", icon: "prices", rights: ["reference.prices", "reference.delivery"] },
      { id: "print-formats", href: "/admin/print-formats", label: "admin.ws.nav.printFormats", icon: "print", rights: ["reference.formats_country"] },
      { id: "cities", href: "/admin/cities", label: "admin.ws.nav.cities", icon: "cities", rights: ["reference.cities"] },
    ],
  },
  {
    id: "operations",
    label: "admin.ws.group.operations",
    items: [
      { id: "orders", href: "/admin/orders", label: "admin.nav.orders", icon: "orders", rights: ["orders"] },
      { id: "activity", href: "/admin/activity", label: "admin.nav.audit", icon: "activity", rights: ["audit"] },
      { id: "preview", href: "/admin/examples/matrix", label: "admin.ws.nav.preview", icon: "preview", rights: ["examples"] },
    ],
  },
];

/** Pages that exist only in a country's workspace: in Global they ask for a country. */
export const COUNTRY_ONLY = ["/admin/landing", "/admin/prices", "/admin/print-formats", "/admin/cities"] as const;

/** Pages of the global workspace only: opening one moves global staff to Global. */
export const GLOBAL_ONLY = [
  "/admin/books",
  "/admin/journal",
  "/admin/methodologies",
  "/admin/story-formats",
  "/admin/themes",
  "/admin/references",
  "/admin/seo",
  "/admin/faq",
  "/admin/team",
  "/admin/settings",
  "/admin/consent",
] as const;

/** Whether a path is `href` or under it; /admin/reference is not under /admin/references. */
export const isUnder = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

/**
 * The rights each admin page asks for (any of them, in some scope); the API checks again. The
 * longest matching address wins; /admin itself (the Inbox) is everyone's.
 */
const ROUTES: { href: string; rights: readonly AdminRight[]; superOnly?: boolean }[] = [
  { href: "/admin", rights: [] },
  { href: "/admin/overview", rights: ["dashboard"] },
  { href: "/admin/books", rights: ["books", "books.review"] },
  { href: "/admin/orders", rights: ["orders"] },
  { href: "/admin/catalog", rights: ["catalog"] },
  { href: "/admin/examples", rights: ["examples"] },
  { href: "/admin/methodologies", rights: ["methodologies", "methodologies.read"] },
  { href: "/admin/story-formats", rights: ["story_formats", "story_formats.read"] },
  { href: "/admin/themes", rights: ["themes", "themes.read"] },
  { href: "/admin/references", rights: ["references"] },
  { href: "/admin/journal", rights: ["journal"] },
  { href: "/admin/activity", rights: ["audit"] },
  { href: "/admin/seo", rights: ["seo"] },
  { href: "/admin/team", rights: ["team"] },
  { href: "/admin/landing", rights: ["reference.landing"] },
  { href: "/admin/prices", rights: ["reference.prices", "reference.delivery"] },
  { href: "/admin/print-formats", rights: ["reference.formats_country"] },
  { href: "/admin/cities", rights: ["reference.cities"] },
  { href: "/admin/faq", rights: ["reference"] },
  { href: "/admin/settings", rights: ["reference", "team", "dashboard"] },
  { href: "/admin/consent", rights: [], superOnly: true },
  // The old Reference data page: it only sends to where its tabs went (see ReferenceRedirect).
  {
    href: "/admin/reference",
    rights: ["reference", "reference.prices", "reference.landing", "reference.cities", "reference.delivery", "reference.formats_country"],
  },
];

/** The page a path belongs to: the longest route it is or is under. */
function routeOf(pathname: string) {
  return ROUTES.filter(({ href }) => isUnder(pathname, href) && (href !== "/admin" || pathname === "/admin")).sort((a, b) => b.href.length - a.href.length)[0];
}

/** Whether the session may open the page at `pathname` (403 otherwise). Unknown admin paths are left to Next's 404. */
export function canOpen(access: AdminAccess, pathname: string): boolean {
  const route = routeOf(pathname);
  if (!route) return true;
  if (route.superOnly) return isSuperAdmin(access);
  if (!route.rights.length) return true;
  // A page of Global's alone needs the right everywhere; others any scope (the page narrows to countries).
  if (workspaceOf(pathname) === "global") return route.rights.some((right) => allowedFor(access, right, null));
  return allowed(access, route.rights);
}

/** Which workspace a page belongs to: a country's, Global's, or both (Inbox, orders, catalog…). */
export function workspaceOf(pathname: string): Workspace | "both" {
  if (COUNTRY_ONLY.some((href) => isUnder(pathname, href))) return "country";
  if (GLOBAL_ONLY.some((href) => isUnder(pathname, href))) return "global";
  return "both";
}

/** Whether the session sees a menu entry: global entries need the right everywhere, country ones in that country. */
export function canSee(access: AdminAccess, entry: NavEntry, country: string | null): boolean {
  if (entry.superOnly) return isSuperAdmin(access);
  if (!entry.rights.length) return true;
  return entry.rights.some((right) => allowedFor(access, right, country ? [country] : null));
}

/** A workspace's menu as the session sees it: entries it cannot open are left out, then empty groups. */
export function navFor(access: AdminAccess, country: string | null): NavGroup[] {
  const groups = country ? COUNTRY_NAV : GLOBAL_NAV;
  return groups.map((group) => ({ ...group, items: group.items.filter((entry) => canSee(access, entry, country)) })).filter((group) => group.items.length > 0);
}

/** The menu entry a path is (the longest match), for the highlight; the Inbox only at /admin itself. */
export function activeEntry(groups: readonly NavGroup[], pathname: string): NavEntry | undefined {
  return groups
    .flatMap((group) => group.items)
    .filter(({ href }) => (href === "/admin" ? pathname === href : isUnder(pathname, href)))
    .sort((a, b) => b.href.length - a.href.length)[0];
}

/**
 * Where switching to another workspace lands: the same page when the target workspace has it and
 * the session sees it there, else that workspace's Inbox.
 */
export function switchTarget(access: AdminAccess, pathname: string, country: string | null): string {
  const target = navFor(access, country);
  const entry = activeEntry(target, pathname);
  if (!entry || entry.id === "inbox") return "/admin";
  // A page inside a section (a book, a catalog book) stays only where its section is a page of both.
  return pathname === entry.href || workspaceOf(pathname) === "both" ? pathname : entry.href;
}
