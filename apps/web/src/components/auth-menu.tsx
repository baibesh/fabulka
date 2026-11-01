"use client";

import { useMutation } from "@tanstack/react-query";
import { BookHeart, Loader2, LogIn, LogOut, Package, ShieldCheck, UserRound, X } from "lucide-react";
import { AUTH_ERROR } from "@fabulka/shared";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useI18n } from "@/i18n/i18n";
import { loginUrl, logout, useMe } from "@/lib/auth";

/**
 * The header's sign-in: «Войти» for a visitor, the account menu once signed in, nothing while
 * sign-in is off. Signing in is never required, so this stays out of the way.
 */
export function AuthMenu({ pathname }: { pathname: string }) {
  const { t, locale } = useI18n();
  const me = useMe();
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const signOut = useMutation({ mutationFn: logout });

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  if (!me.data?.enabled) return null;
  const user = me.data.user;
  // The name from the account (Keycloak's first and last name); the email only when there is none.
  const label = user?.name || user?.email;

  if (!user) {
    return (
      <a
        href={loginUrl(pathname, locale)}
        data-testid="auth-login"
        aria-label={t("auth.login")}
        className="flex items-center gap-1.5 rounded-xl px-1.5 py-2 text-sm font-semibold text-muted hover:text-foreground sm:px-3"
      >
        <LogIn className="size-4" />
        <span className="hidden sm:inline">{t("auth.login")}</span>
      </a>
    );
  }

  return (
    <div ref={menu} className="relative">
      <button
        type="button"
        data-testid="auth-account"
        aria-label={t("auth.account")}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
        className={`flex items-center gap-1.5 rounded-xl px-1.5 py-2 text-sm font-semibold sm:px-3 ${
          open ? "bg-accent/15 text-accent" : "text-muted hover:text-foreground"
        }`}
      >
        <UserRound className="size-4" />
        {label && <span className="hidden max-w-32 truncate lg:inline">{label}</span>}
      </button>
      {open && (
        <div
          role="menu"
          data-testid="auth-menu"
          className="absolute right-0 mt-2 flex w-64 max-w-[calc(100vw-2rem)] flex-col gap-1 rounded-2xl border border-border bg-card p-2 shadow-lg"
        >
          {(user.name || user.email) && (
            <div className="flex flex-col px-3 py-2">
              {user.name && (
                <p data-testid="auth-name" className="truncate text-sm font-semibold" title={user.name}>
                  {user.name}
                </p>
              )}
              {user.email && (
                <p data-testid="auth-email" className="truncate text-sm text-muted" title={user.email}>
                  {user.email}
                </p>
              )}
            </div>
          )}
          <Link
            href="/my"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold hover:bg-accent/10"
          >
            <BookHeart className="size-4 text-accent" />
            {t("auth.my")}
          </Link>
          <Link
            href="/my#orders"
            role="menuitem"
            data-testid="auth-orders"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold hover:bg-accent/10"
          >
            <Package className="size-4 text-accent" />
            {t("auth.orders")}
          </Link>
          {user.admin && (
            <Link
              href="/admin"
              role="menuitem"
              data-testid="auth-admin"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold hover:bg-accent/10"
            >
              <ShieldCheck className="size-4 text-accent" />
              {t("auth.admin")}
            </Link>
          )}
          <button
            type="button"
            role="menuitem"
            data-testid="auth-logout"
            disabled={signOut.isPending}
            onClick={() => signOut.mutate()}
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold hover:bg-accent/10 disabled:opacity-60"
          >
            {signOut.isPending ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4 text-muted" />}
            {t("auth.logout")}
          </button>
        </div>
      )}
    </div>
  );
}

const noSubscribe = () => () => undefined;
const authFailed = () => new URLSearchParams(window.location.search).get("auth") === AUTH_ERROR;

/** After a sign-in that did not go through (?auth=error): a small note; the page works as before. */
export function AuthNotice() {
  const { t } = useI18n();
  const failed = useSyncExternalStore(noSubscribe, authFailed, () => false);
  const [closed, setClosed] = useState(false);
  if (!failed || closed) return null;
  return (
    <div className="mx-auto w-full max-w-5xl px-4 pt-3">
      <p
        role="status"
        data-testid="auth-error"
        className="flex items-start gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm text-muted"
      >
        <span className="mr-auto">{t("auth.error")}</span>
        <button type="button" aria-label={t("auth.error.close")} onClick={() => setClosed(true)} className="hover:text-foreground">
          <X className="size-4" />
        </button>
      </p>
    </div>
  );
}
