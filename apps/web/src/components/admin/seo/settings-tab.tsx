"use client";

import { SeoSettingsSchema, type SeoSettings } from "@fabulka/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMutation } from "@/lib/query";
import { Globe, Save } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox, ChoiceLabel } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { ErrorText, Notice } from "@/components/ui/notice";
import { QueryState } from "@/components/ui/query-state";
import { adminSeoSettings, saveSeoSettings, seoHistory } from "@/lib/admin-api";
import { Card, useAdminI18n } from "../ui";
import { HistoryList } from "./shared";

/** «Настройки»: what is the same for every language and country - verification, analytics, robots.txt, the sitemap. */
export function SettingsTab() {
  const settings = useQuery({ queryKey: ["admin", "seo", "settings"], queryFn: adminSeoSettings });
  if (!settings.data) return <QueryState error={settings.error} scope="admin" />;
  return <SettingsForm initial={settings.data} />;
}

function SettingsForm({ initial }: { initial: SeoSettings }) {
  const { t } = useAdminI18n();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(initial);
  const history = useQuery({ queryKey: ["admin", "seo", "history", "settings"], queryFn: () => seoHistory({ kind: "settings" }) });
  const parsed = SeoSettingsSchema.safeParse(draft);
  const problem = (path: string) => (parsed.success ? undefined : parsed.error.issues.find((issue) => issue.path.join(".") === path)?.message);
  const save = useMutation({
    mutationFn: () => saveSeoSettings(SeoSettingsSchema.parse(draft)),
    onSuccess: (saved) => {
      queryClient.setQueryData(["admin", "seo", "settings"], saved);
      void queryClient.invalidateQueries({ queryKey: ["admin", "seo", "history", "settings"] });
    },
  });
  const verification = (field: keyof SeoSettings["verification"], value: string) => setDraft((d) => ({ ...d, verification: { ...d.verification, [field]: value } }));
  const analytics = (field: keyof SeoSettings["analytics"], value: string) => setDraft((d) => ({ ...d, analytics: { ...d.analytics, [field]: value } }));

  return (
    <form
      data-testid="seo-settings"
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <Notice tone="highlight" icon={<Globe className="size-5 shrink-0 text-accent" />}>
        <p>{t("admin.seo.settings.note")}</p>
      </Notice>
      {/* At the top, next to the note: one form, one save. */}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" data-testid="seo-settings-save" loading={save.isPending} disabled={!parsed.success} icon={<Save className="size-4" />}>
          {t("admin.seo.settings.save")}
        </Button>
        {save.isSuccess && (
          <span data-testid="seo-settings-saved" className="text-sm text-success">
            {save.data.revalidated ? t("admin.seo.settings.saved") : t("admin.seo.notRevalidated")}
          </span>
        )}
        {save.isError && <ErrorText>{save.error.message}</ErrorText>}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t("admin.seo.settings.verification")}>
          <p className="text-sm text-muted">{t("admin.seo.settings.verificationHint")}</p>
          <Field label="Google Search Console" error={problem("verification.google")}>
            <Input data-testid="seo-settings-google" code value={draft.verification.google} onChange={(e) => verification("google", e.target.value)} />
          </Field>
          <Field label={t("admin.seo.settings.yandexWebmaster")} error={problem("verification.yandex")}>
            <Input data-testid="seo-settings-yandex" code value={draft.verification.yandex} onChange={(e) => verification("yandex", e.target.value)} />
          </Field>
          <Field label="Bing Webmaster Tools" error={problem("verification.bing")}>
            <Input data-testid="seo-settings-bing" code value={draft.verification.bing} onChange={(e) => verification("bing", e.target.value)} />
          </Field>
        </Card>
        <Card title={t("admin.seo.settings.analytics")}>
          <p className="text-sm text-muted">{t("admin.seo.settings.analyticsHint")}</p>
          <Field label="Google Tag Manager" error={problem("analytics.gtm")}>
            <Input data-testid="seo-settings-gtm" code value={draft.analytics.gtm} placeholder="GTM-XXXXXXX" onChange={(e) => analytics("gtm", e.target.value)} />
          </Field>
          <Field label="Google Analytics 4" error={problem("analytics.ga4")}>
            <Input data-testid="seo-settings-ga4" code value={draft.analytics.ga4} placeholder="G-XXXXXXXXXX" onChange={(e) => analytics("ga4", e.target.value)} />
          </Field>
          <Field label={t("admin.seo.settings.metrika")} error={problem("analytics.yandexMetrika")}>
            <Input data-testid="seo-settings-metrika" code value={draft.analytics.yandexMetrika} placeholder="12345678" onChange={(e) => analytics("yandexMetrika", e.target.value)} />
          </Field>
          <Field label="Meta Pixel" error={problem("analytics.metaPixel")}>
            <Input data-testid="seo-settings-pixel" code value={draft.analytics.metaPixel} placeholder="1234567890" onChange={(e) => analytics("metaPixel", e.target.value)} />
          </Field>
        </Card>
        <Card title="robots.txt">
          <Field label={t("admin.seo.settings.robots")} hint={t("admin.seo.settings.robotsHint")} error={problem("robots")}>
            <Textarea data-testid="seo-settings-robots" code className="min-h-32" value={draft.robots} placeholder={"User-agent: GPTBot\nDisallow: /"} onChange={(e) => setDraft({ ...draft, robots: e.target.value })} />
          </Field>
        </Card>
        <Card title={t("admin.seo.settings.sitemap")}>
          <ChoiceLabel strong>
            <Checkbox data-testid="seo-settings-examples" checked={draft.sitemapExamples} onChange={(e) => setDraft({ ...draft, sitemapExamples: e.target.checked })} />
            {t("admin.seo.settings.sitemapExamples")}
          </ChoiceLabel>
          <p className="text-xs text-muted">{t("admin.seo.settings.sitemapHint")}</p>
        </Card>
      </div>
      <Card title={t("admin.seo.history.recent")}>{history.data ? <HistoryList entries={history.data.slice(0, 20)} /> : <QueryState error={history.error} scope="admin" />}</Card>
    </form>
  );
}
