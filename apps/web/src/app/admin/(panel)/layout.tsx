import { Suspense } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { T } from "@/i18n/t";

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<p className="p-8 text-muted"><T k="admin.loading" scope="admin" /></p>}>
      <AdminShell>{children}</AdminShell>
    </Suspense>
  );
}
