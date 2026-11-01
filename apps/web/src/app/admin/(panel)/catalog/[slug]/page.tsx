import { Suspense } from "react";
import { TemplateEditor } from "@/components/admin/template-editor";
import { T } from "@/i18n/t";

export default function AdminTemplatePage({ params }: PageProps<"/admin/catalog/[slug]">) {
  return (
    <Suspense fallback={<p className="text-muted"><T k="admin.loading" scope="admin" /></p>}>
      <TemplateEditor params={params} />
    </Suspense>
  );
}
