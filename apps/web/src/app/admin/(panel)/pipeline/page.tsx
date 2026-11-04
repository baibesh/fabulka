import { Suspense } from "react";
import { PipelinePage } from "@/components/admin/pipeline/pipeline-page";
import { T } from "@/i18n/t";

export default function AdminPipelinePage() {
  return (
    <Suspense fallback={<p className="text-muted"><T k="admin.loading" scope="admin" /></p>}>
      <PipelinePage />
    </Suspense>
  );
}
