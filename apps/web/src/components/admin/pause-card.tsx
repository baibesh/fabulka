"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMutation } from "@/lib/query";
import { Pause, Play } from "lucide-react";
import { adminStats, setPaused } from "@/lib/admin-api";
import { Button } from "@/components/ui/button";
import { QueryState } from "@/components/ui/query-state";
import { useAdminI18n } from "./ui";

/** Book generation running or paused, and the switch (global staff: POST /admin/pause). */
export function PauseCard() {
  const { t } = useAdminI18n();
  const queryClient = useQueryClient();
  const stats = useQuery({ queryKey: ["admin", "stats"], queryFn: adminStats, refetchInterval: 10_000 });
  const pause = useMutation({
    mutationFn: setPaused,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "inbox"] });
    },
  });
  if (!stats.data) return <QueryState error={stats.error} scope="admin" />;
  const paused = stats.data.paused;
  return (
    <section
      data-testid="pause-card"
      data-paused={paused}
      className={`flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-5 ${paused ? "border-danger/40 bg-danger/10" : "border-border bg-card"}`}
    >
      <div>
        <p className="font-bold">{paused ? t("admin.dashboard.paused") : t("admin.dashboard.running")}</p>
        <p className="text-sm text-muted">{paused ? t("admin.dashboard.paused.text") : t("admin.dashboard.running.text")}</p>
      </div>
      <Button
        variant={paused ? "success" : "danger"}
        data-testid="pause-toggle"
        loading={pause.isPending}
        icon={paused ? <Play className="size-4" /> : <Pause className="size-4" />}
        onClick={() => pause.mutate(!paused)}
      >
        {paused ? t("admin.dashboard.resume") : t("admin.dashboard.pause")}
      </Button>
    </section>
  );
}
