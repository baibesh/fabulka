"use client";

import type { ModelCall, ModelCallStatus } from "@fabulka/shared";
import { Badge } from "@/components/ui/badge";
import { useAdminI18n } from "../ui";

/** «Успешно» or «Ошибка» for a model call. */
export function CallStatus({ status }: { status: ModelCallStatus }) {
  const { t } = useAdminI18n();
  return <Badge tone={status === "ok" ? "success" : "danger"}>{t(`admin.journal.status.${status}`)}</Badge>;
}

/** Tokens in → out, or the number of images: what the call was billed for. */
export function useUsage() {
  const { t, number } = useAdminI18n();
  return (call: ModelCall) => {
    if (call.images) return t("admin.journal.images", { count: call.images });
    if (call.inputTokens === null && call.outputTokens === null) return "-";
    return `${number(call.inputTokens ?? 0)} → ${number(call.outputTokens ?? 0)}`;
  };
}
