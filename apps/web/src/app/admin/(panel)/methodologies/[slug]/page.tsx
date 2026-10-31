import { Suspense } from "react";
import { MethodologyPage } from "@/components/admin/methodology-editor";

export default function AdminMethodologyPage({ params }: PageProps<"/admin/methodologies/[slug]">) {
  return (
    <Suspense fallback={<p className="text-muted">Загружаем…</p>}>
      <MethodologyPage params={params} />
    </Suspense>
  );
}
