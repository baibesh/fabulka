import { Suspense } from "react";
import { ThemeEditorPage } from "@/components/admin/theme-editor";
import { T } from "@/i18n/t";

export default function AdminThemeEditorPage() {
  return (
    <Suspense fallback={<p className="text-muted"><T k="admin.loading" scope="admin" /></p>}>
      <ThemeEditorPage />
    </Suspense>
  );
}
