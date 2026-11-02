"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { KeyRound, Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { adminLogin, adminLoginOptions } from "@/lib/admin-api";
import { LanguagePicker } from "@/components/layout/locale-pickers";
import { useAdminI18n } from "./ui";
import { Spinner } from "@/components/ui/spinner";
import { Button, buttonClass } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ErrorText } from "@/components/ui/notice";

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
    <div data-testid="admin-login" data-density="compact" className="flex w-full max-w-sm flex-col gap-4 rounded-3xl border border-border bg-card p-8">
      <div className="flex items-center gap-2 text-xl font-extrabold">
        <Lock className="size-5 text-accent" />
        {t("admin.login.title")}
      </div>
      {options.isPending && <Spinner className="text-muted" />}
      {keycloak && (
        // An API route that redirects to Keycloak, not a page (the site's root [locale] segment makes
        // the rule take any path for one).
        // eslint-disable-next-line @next/next/no-html-link-for-pages
        <a
          href="/api/auth/login?return=/admin"
          data-testid="admin-login-keycloak"
          className={buttonClass({ size: "lg" })}
        >
          <KeyRound className="size-4" />
          {t("admin.login.keycloak")}
        </a>
      )}
      {keycloak && password && <p className="text-center text-xs text-muted">{t("admin.login.or")}</p>}
      {password && <PasswordForm />}
      <LanguagePicker scope="admin" testId="admin-language" optionPrefix="admin-lang-" className="self-center" />
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
      <Field label={t("admin.login.email")}>
        <Input data-testid="admin-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label={t("admin.login.password")}>
        <Input data-testid="admin-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      {login.isError && <ErrorText className="text-sm">{login.error.message}</ErrorText>}
      <Button type="submit" size="lg" data-testid="admin-submit" loading={login.isPending}>
        {t("admin.login.submit")}
      </Button>
    </form>
  );
}
