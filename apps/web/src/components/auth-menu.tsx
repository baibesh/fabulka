"use client";

import { useMutation } from "@tanstack/react-query";
import { BookHeart, LogIn, LogOut, Package, ShieldCheck, UserRound, X } from "lucide-react";
import { AUTH_ERROR } from "@fabulka/shared";
import Link from "next/link";
import { useState } from "react";
import { useClientValue } from "@/hooks/use-hydrated";
import { useI18n } from "@/i18n/i18n";
import { loginUrl, logout, useMe } from "@/lib/auth";
import { Menu, MenuItem, menuItemClass } from "./ui/menu";
import { Notice } from "./ui/notice";
import { Spinner } from "./ui/spinner";

/**
 * The header's sign-in: «Войти» for a visitor, the account menu once signed in, nothing while
 * sign-in is off. Signing in is never required, so this stays out of the way.
 */
export function AuthMenu({ pathname }: { pathname: string }) {
  const { t, locale } = useI18n();
  const me = useMe();
  const signOut = useMutation({ mutationFn: logout });

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
    <Menu
      data-testid="auth-menu"
      trigger={({ open, props }) => (
        <button
          type="button"
          data-testid="auth-account"
          aria-label={t("auth.account")}
          {...props}
          className={`flex items-center gap-1.5 rounded-xl px-1.5 py-2 text-sm font-semibold sm:px-3 ${
            open ? "bg-accent/15 text-accent" : "text-muted hover:text-foreground"
          }`}
        >
          <UserRound className="size-4" />
          {label && <span className="hidden max-w-32 truncate lg:inline">{label}</span>}
        </button>
      )}
    >
      {(close) => (
        <>
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
          <Link href="/my" role="menuitem" onClick={close} className={menuItemClass}>
            <BookHeart className="size-4 text-accent" />
            {t("auth.my")}
          </Link>
          <Link href="/my#orders" role="menuitem" data-testid="auth-orders" onClick={close} className={menuItemClass}>
            <Package className="size-4 text-accent" />
            {t("auth.orders")}
          </Link>
          {user.admin && (
            <Link href="/admin" role="menuitem" data-testid="auth-admin" onClick={close} className={menuItemClass}>
              <ShieldCheck className="size-4 text-accent" />
              {t("auth.admin")}
            </Link>
          )}
          <MenuItem data-testid="auth-logout" disabled={signOut.isPending} onClick={() => signOut.mutate()}>
            {signOut.isPending ? <Spinner size="sm" /> : <LogOut className="size-4 text-muted" />}
            {t("auth.logout")}
          </MenuItem>
        </>
      )}
    </Menu>
  );
}

const authFailed = () => new URLSearchParams(window.location.search).get("auth") === AUTH_ERROR;

/** After a sign-in that did not go through (?auth=error): a small note; the page works as before. */
export function AuthNotice() {
  const { t } = useI18n();
  const failed = useClientValue(authFailed, false);
  const [closed, setClosed] = useState(false);
  if (!failed || closed) return null;
  return (
    <div className="mx-auto w-full max-w-5xl px-4 pt-3">
      <Notice
        as="p"
        role="status"
        data-testid="auth-error"
        size="sm"
        className="items-start"
        action={
          <button type="button" aria-label={t("auth.error.close")} onClick={() => setClosed(true)} className="hover:text-foreground">
            <X className="size-4" />
          </button>
        }
      >
        {t("auth.error")}
      </Notice>
    </div>
  );
}
