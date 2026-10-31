"use client";

import { useQuery } from "@tanstack/react-query";
import { BookOpen, LayoutDashboard, Library, LogOut, Package, ScrollText } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { adminLogout, adminMe } from "@/lib/admin-api";
import { ApiError } from "@/lib/api";

const NAV = [
  { href: "/admin", label: "Дашборд", icon: LayoutDashboard },
  { href: "/admin/books", label: "Книги", icon: BookOpen },
  { href: "/admin/orders", label: "Заказы", icon: Package },
  { href: "/admin/catalog", label: "Каталог", icon: Library },
  { href: "/admin/journal", label: "Журнал", icon: ScrollText },
];

/** The admin frame: checks the session, then shows the sidebar and the page. */
export function AdminShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const me = useQuery({ queryKey: ["admin", "me"], queryFn: adminMe, retry: false });
  const signedOut = me.error instanceof ApiError && me.error.status === 401;

  useEffect(() => {
    if (signedOut) router.replace("/admin/login");
  }, [signedOut, router]);

  if (!me.isSuccess) return <p className="p-8 text-muted">{me.isError && !signedOut ? me.error.message : "Загружаем…"}</p>;

  const logout = async () => {
    await adminLogout();
    router.replace("/admin/login");
  };

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex shrink-0 gap-1 border-b border-border bg-card p-3 md:w-56 md:flex-col md:border-r md:border-b-0 md:p-4">
        <p className="hidden px-3 pb-4 text-sm font-extrabold uppercase tracking-widest text-accent md:block">Админка</p>
        <nav className="flex flex-1 gap-1 overflow-x-auto md:flex-col">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === "/admin" ? pathname === href : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                data-testid={`admin-nav-${href.split("/")[2] ?? "dashboard"}`}
                className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold whitespace-nowrap ${
                  active ? "bg-accent/15 text-accent" : "text-muted hover:text-foreground"
                }`}
              >
                <Icon className="size-4" />
                {label}
              </Link>
            );
          })}
        </nav>
        <button type="button" onClick={() => void logout()} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted hover:text-foreground">
          <LogOut className="size-4" />
          <span className="hidden md:inline">Выйти</span>
        </button>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col gap-6 p-4 md:p-8">{children}</main>
    </div>
  );
}
