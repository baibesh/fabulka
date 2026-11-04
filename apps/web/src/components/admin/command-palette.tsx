"use client";

import { useQuery } from "@tanstack/react-query";
import { allowed, allowedFor, methodologyText, storyFormatText, type AdminRight } from "@fabulka/shared";
import { BookOpen, CornerDownLeft, Globe, GraduationCap, LayoutGrid, Package, Palette, Search, Settings, SquareArrowOutUpRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Flag } from "@/components/ui/flag";
import { useHydrated } from "@/hooks/use-hydrated";
import { cx } from "@/components/ui/cx";
import { adminMethodologies, adminSearch, adminStoryFormats, adminThemes } from "@/lib/admin-api";
import { ALL, withCountry } from "@/lib/admin-country";
import { navFor } from "@/lib/admin-workspace";
import { themeName } from "@/lib/themes";
import type { MessageKey } from "@/i18n/messages";
import { SETTINGS_TABS } from "./settings-page";
import { useAdminI18n } from "./ui";
import { useWorkingCountry } from "./working-country";
import { useWorkspaceName } from "./workspace-switcher";

/** Opens the palette on Cmd+K (Ctrl+K elsewhere), wherever focus is. */
export function usePaletteShortcut(open: () => void) {
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        open();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
}

/** The shortcut as this computer writes it: ⌘K on a Mac, Ctrl K elsewhere (known once hydrated). */
export function ShortcutHint() {
  const hydrated = useHydrated();
  const mac = hydrated && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  return <kbd className="rounded-md border border-border px-1.5 text-[11px] font-semibold">{mac ? "⌘K" : "Ctrl K"}</kbd>;
}

type Kind = "section" | "workspace" | "setting" | "book" | "order" | "method" | "format" | "theme";

/** The palette's groups, in the order they are listed. */
const KINDS: { kind: Kind; label: MessageKey }[] = [
  { kind: "section", label: "admin.palette.group.section" },
  { kind: "workspace", label: "admin.palette.group.workspace" },
  { kind: "book", label: "admin.palette.group.book" },
  { kind: "order", label: "admin.palette.group.order" },
  { kind: "method", label: "admin.palette.group.method" },
  { kind: "format", label: "admin.palette.group.format" },
  { kind: "theme", label: "admin.palette.group.theme" },
  { kind: "setting", label: "admin.palette.group.setting" },
];

interface Item {
  kind: Kind;
  id: string;
  label: string;
  hint?: string;
  /** More words it is found by. */
  keywords?: string;
  icon: ReactNode;
  run: () => void;
}

/** Each group shows this many matches at most. */
const PER_GROUP = 6;

/** Every word of the query is somewhere in the item's words. */
function matches(item: Item, words: string[]): boolean {
  const haystack = `${item.label} ${item.hint ?? ""} ${item.keywords ?? ""}`.toLowerCase();
  return words.every((word) => haystack.includes(word));
}

/**
 * The command palette (Cmd+K): jump to a section of this workspace or Global's, switch workspace,
 * open a book (by title, child's name or id), an order (by number), a method, a story format, a
 * theme or a settings tab. Only what the session may open is offered. Keyboard first: type, move
 * with the arrows, Enter opens, Esc closes; it is a combobox over a listbox for screen readers.
 */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { t } = useAdminI18n();
  // Each opening starts afresh (a new body), but closing leaves the body in the closed dialog: the
  // focused combobox and its active option are not torn out from under the browser as it closes.
  const [session, setSession] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) setSession((n) => n + 1);
  }

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLInputElement>("[role=combobox]")?.focus();
    }
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      data-testid="command-palette"
      aria-label={t("admin.palette.title")}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="mx-auto mt-[12vh] w-[calc(100%-2rem)] max-w-xl overflow-hidden rounded-2xl border border-border bg-card p-0 text-foreground shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-sm"
    >
      {session > 0 && <PaletteBody key={session} open={open} onClose={onClose} />}
    </dialog>
  );
}

function PaletteBody({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { t, locale } = useAdminI18n();
  const workspaceName = useWorkspaceName();
  const { access, country, options, allowAll, follows, setCountry } = useWorkingCountry();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const deferred = useDeferredValue(query.trim());

  const can = (...rights: AdminRight[]) => rights.some((right) => allowedFor(access, right, null));
  const methods = useQuery({ queryKey: ["admin", "methodologies"], queryFn: adminMethodologies, enabled: open && can("methodologies", "methodologies.read") });
  const formats = useQuery({ queryKey: ["admin", "story-formats"], queryFn: adminStoryFormats, enabled: open && can("story_formats", "story_formats.read") });
  const themes = useQuery({ queryKey: ["admin", "themes"], queryFn: adminThemes, enabled: open && can("themes", "themes.read") });
  const searchable = deferred.length >= 2 && allowed(access, ["books", "books.review", "orders"]);
  const found = useQuery({ queryKey: ["admin", "search", deferred], queryFn: () => adminSearch(deferred), enabled: open && searchable, staleTime: 10_000 });

  const items = useMemo(() => {
    const go = (href: string, param: string | null) => () => {
      onClose();
      router.push(withCountry(href, param));
    };
    const here = follows ? (country ?? ALL) : null;
    const globalParam = follows && allowAll ? ALL : null;
    const list: Item[] = [];

    // Sections: this workspace's, then Global's for global staff working in a country.
    const seen = new Set<string>();
    const workspaces = country && allowAll ? [country, null] : [country];
    for (const ws of workspaces) {
      for (const group of navFor(access, ws)) {
        for (const entry of group.items) {
          if (seen.has(entry.href)) continue;
          seen.add(entry.href);
          list.push({
            kind: "section",
            id: entry.id,
            label: t(entry.label),
            hint: `${workspaceName(ws)}${group.label ? ` · ${t(group.label)}` : ""}`,
            icon: <SquareArrowOutUpRight className="size-4" />,
            run: go(entry.href, ws === country ? here : globalParam),
          });
        }
      }
    }

    // Workspaces.
    if (follows) {
      const pick = (next: string | null) => () => {
        onClose();
        if (next !== country) setCountry(next);
      };
      if (allowAll) list.push({ kind: "workspace", id: "all", label: t("admin.ws.global"), keywords: "fabulka global", icon: <Globe className="size-4" />, run: pick(null) });
      for (const code of options) {
        list.push({ kind: "workspace", id: code, label: workspaceName(code), keywords: code, icon: <Flag code={code} />, run: pick(code) });
      }
    }

    // Books and orders found by the API.
    for (const book of found.data?.books ?? []) {
      list.push({
        kind: "book",
        id: book.id,
        label: book.title ?? book.childName,
        hint: `${book.childName} · ${book.id}`,
        keywords: deferred,
        icon: <BookOpen className="size-4" />,
        run: go(`/admin/books/${book.id}`, globalParam),
      });
    }
    for (const order of found.data?.orders ?? []) {
      const param = !follows ? null : country && order.country === country ? country : allowAll ? ALL : order.country;
      list.push({
        kind: "order",
        id: order.id,
        label: t("admin.palette.order", { id: order.id }),
        hint: [order.bookTitle, order.country].filter(Boolean).join(" · "),
        keywords: deferred,
        icon: <Package className="size-4" />,
        run: go(`/admin/orders?order=${encodeURIComponent(order.id)}`, param),
      });
    }

    for (const method of methods.data ?? []) {
      list.push({
        kind: "method",
        id: method.slug,
        label: methodologyText(method.texts, locale).name || method.slug,
        keywords: method.slug,
        icon: <GraduationCap className="size-4" />,
        run: go(`/admin/methodologies/${method.slug}`, globalParam),
      });
    }
    for (const format of formats.data ?? []) {
      list.push({
        kind: "format",
        id: format.slug,
        label: storyFormatText(format.texts, locale).name || format.slug,
        keywords: format.slug,
        icon: <LayoutGrid className="size-4" />,
        run: go(`/admin/story-formats/${format.slug}`, globalParam),
      });
    }
    for (const theme of themes.data ?? []) {
      list.push({
        kind: "theme",
        id: theme.theme.id,
        label: themeName(theme.theme, t, locale),
        keywords: theme.theme.id,
        icon: <Palette className="size-4" />,
        run: go(`/admin/themes#theme-${theme.theme.id}`, globalParam),
      });
    }
    for (const tab of SETTINGS_TABS) {
      if (!can(tab.right)) continue;
      list.push({
        kind: "setting",
        id: tab.id,
        label: t(tab.label),
        hint: t("admin.ws.nav.settings"),
        icon: <Settings className="size-4" />,
        run: go(`/admin/settings?tab=${tab.id}`, globalParam),
      });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `can`, `go` and the namers are rebuilt from these
  }, [access, country, options, allowAll, follows, found.data, methods.data, formats.data, themes.data, locale, deferred]);

  // With no query: sections and workspaces; with one, the matches of every group.
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = KINDS.map(({ kind, label }) => ({
    kind,
    label,
    items: items
      .filter((item) => item.kind === kind && (words.length ? matches(item, words) : kind === "section" || kind === "workspace"))
      .slice(0, words.length || kind === "workspace" ? PER_GROUP : 50),
  })).filter((group) => group.items.length > 0);
  const flat = shown.flatMap((group) => group.items);
  const index = Math.min(active, Math.max(flat.length - 1, 0));
  const optionId = (i: number) => `${listId}-${i}`;

  // The active option stays in view while the arrows move.
  useEffect(() => {
    if (open) document.getElementById(optionId(index))?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- optionId is derived from listId
  }, [index, listId, open]);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!flat.length) return;
      const by = event.key === "ArrowDown" ? 1 : -1;
      setActive((index + by + flat.length) % flat.length);
    } else if (event.key === "Home" && event.ctrlKey) {
      setActive(0);
    } else if (event.key === "End" && event.ctrlKey) {
      setActive(flat.length - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      flat[index]?.run();
    }
  };

  // Where each group's options start in the flat list (the arrows move through all of them).
  const starts = shown.map((_, g) => shown.slice(0, g).reduce((sum, group) => sum + group.items.length, 0));
  return (
    <div className="flex max-h-[min(70vh,34rem)] flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4">
        <Search aria-hidden className="size-4 shrink-0 text-muted" />
        <input
          data-testid="palette-input"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && flat.length ? optionId(index) : undefined}
          aria-label={t("admin.palette.title")}
          placeholder={t("admin.palette.placeholder")}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          className="min-h-12 flex-1 bg-transparent text-base outline-none placeholder:text-muted"
        />
        {found.isFetching && <span className="text-xs text-muted">{t("admin.loading")}</span>}
      </div>
      <div id={listId} role="listbox" aria-label={t("admin.palette.title")} className="flex-1 overflow-y-auto p-2">
        {flat.length === 0 && (
          <p data-testid="palette-empty" className="px-3 py-6 text-center text-sm text-muted">
            {deferred.length === 1 ? t("admin.palette.more") : t("admin.palette.empty")}
          </p>
        )}
        {shown.map((group, g) => (
          <div key={group.kind} role="group" aria-label={t(group.label)} className="pb-1">
            <p aria-hidden className="px-3 pt-2 pb-1 text-[11px] font-bold uppercase tracking-widest text-muted">
              {t(group.label)}
            </p>
            {group.items.map((item, n) => {
              const i = starts[g] + n;
              const selected = i === index;
              return (
                <div
                  key={`${item.kind}-${item.id}`}
                  id={optionId(i)}
                  role="option"
                  aria-selected={selected}
                  data-testid="palette-option"
                  data-kind={item.kind}
                  data-id={item.id}
                  onMouseMove={() => setActive(i)}
                  onClick={item.run}
                  className={cx("flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm", selected && "bg-accent/10")}
                >
                  <span className="flex size-5 shrink-0 items-center justify-center text-muted">{item.icon}</span>
                  <span className="min-w-0 flex-1 truncate font-semibold">{item.label}</span>
                  {item.hint && <span className="hidden max-w-[45%] truncate text-xs text-muted sm:inline">{item.hint}</span>}
                  {selected && <CornerDownLeft aria-hidden className="size-3.5 shrink-0 text-muted" />}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <p className="hidden border-t border-border px-4 py-2 text-xs text-muted sm:block">{t("admin.palette.keys")}</p>
    </div>
  );
}
