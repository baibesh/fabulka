"use client";

import { useQuery } from "@tanstack/react-query";
import { useMutation } from "@/lib/query";
import { KeyRound, Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { adminLogin, adminLoginOptions } from "@/lib/admin-api";
import { ApiError } from "@/lib/api";
import { LanguagePicker } from "@/components/layout/locale-pickers";
import { useAdminI18n } from "./ui";
import { Spinner } from "@/components/ui/spinner";
import { Button, buttonClass } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ErrorText } from "@/components/ui/notice";

/**
 * The way in: Keycloak (realm role `admin`, or `seo` for the SEO section only; 2FA there) and, only
 * when ADMIN_PASSWORD_LOGIN is on, the emergency email and password. An older API without the options gets the password form.
 * Keycloak's pages open in the admin's current language (English until switched; ui_locales).
 */
export function LoginForm() {
  const { t, locale } = useAdminI18n();
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
        // An API route that redirects to Keycloak, not a page, so a plain link.
        <a
          href={`/api/auth/login?${new URLSearchParams({ return: "/admin", lang: locale })}`}
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
  // The API words these refusals in Russian; the two a person meets here follow the admin's language.
  const loginError = (error: Error) =>
    error instanceof ApiError && error.status === 401
      ? t("admin.login.error.invalid")
      : error instanceof ApiError && error.status === 429
        ? t("admin.login.error.tooMany")
        : error.message;

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
      {login.isError && <ErrorText className="text-sm">{loginError(login.error)}</ErrorText>}
      <Button type="submit" size="lg" data-testid="admin-submit" loading={login.isPending}>
        {t("admin.login.submit")}
      </Button>
    </form>
  );
}
