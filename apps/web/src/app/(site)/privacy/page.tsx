import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { PageContainer } from "@/components/ui/page";

export const metadata: Metadata = { title: "Конфиденциальность" };

export default function Page() {
  return (
    <PageContainer width="md" gap="none">
      <LegalPage doc="privacy" />
    </PageContainer>
  );
}
