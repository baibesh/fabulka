"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { KeyRound, Loader2, Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { adminLogin, adminLoginOptions } from "@/lib/admin-api";
import { LanguageSwitch } from "./language-switch";
import { button, input, useAdminI18n } from "./ui";
import { Spinner } from "@/components/ui/spinner";

/**
 * The way in: Keycloak (realm role `admin`, 2FA there) and, only when ADMIN_PASSWORD_LOGIN is on, the
 * emergency email and password. An older API without the options gets the password form.
 */
export function LoginForm() {
  const { t } = useAdminI18n();
  const options = useQuery({ queryKey: ["admin-login-options"], queryFn: adminLoginOptions, retry: false });
  const keycloak = options.data?.keycloak ?? false;
  const password = options.data?.password ?? options.isError;

  return (
    <div data-testid="admin-login" className="flex w-full max-w-sm flex-col gap-4 rounded-3xl border border-border bg-card p-8">
      <div className="flex items-center gap-2 text-xl font-extrabold">
        <Lock className="size-5 text-accent" />
        {t("admin.login.title")}
      </div>
      {options.isPending && <Spinner className="text-muted" />}
      {keycloak && (
        <a
          href="/api/auth/login?return=/admin"
          data-testid="admin-login-keycloak"
          className={`${button} flex items-center justify-center gap-2 py-3`}
        >
          <KeyRound className="size-4" />
          {t("admin.login.keycloak")}
        </a>
      )}
      {keycloak && password && <p className="text-center text-xs text-muted">{t("admin.login.or")}</p>}
      {password && <PasswordForm />}
      <LanguageSwitch className="self-center" />
    </div>
  );
}

function PasswordForm() {
  const { t } = useAdminI18n();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const login = useMutation({ mutationFn: adminLogin, onSuccess: () => router.replace("/admin") });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        login.mutate({ email, password });
      }}
      className="flex flex-col gap-4"
    >
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        {t("admin.login.email")}
        <input data-testid="admin-email" type="email" autoComplete="username" className={input} value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        {t("admin.login.password")}
        <input
          data-testid="admin-password"
          type="password"
          autoComplete="current-password"
          className={input}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      {login.isError && (
        <p role="alert" className="text-sm text-danger">
          {login.error.message}
        </p>
      )}
      <button type="submit" data-testid="admin-submit" disabled={login.isPending} className={`${button} flex items-center justify-center gap-2 py-3`}>
        {login.isPending && <Loader2 className="size-4 animate-spin" />}
        {t("admin.login.submit")}
      </button>
    </form>
  );
}
