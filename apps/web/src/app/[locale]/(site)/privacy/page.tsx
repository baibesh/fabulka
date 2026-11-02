import type { Metadata } from "next";
import { LegalPage } from "@/components/layout/legal-page";
import { PageContainer } from "@/components/ui/page";
import type { UiLocale } from "@/i18n/messages";
import { alternates } from "@/lib/seo";

export async function generateMetadata({ params }: PageProps<"/[locale]/privacy">): Promise<Metadata> {
  const { locale } = await params;
  return { title: "Конфиденциальность", alternates: alternates(locale as UiLocale, "/privacy") };
}

export default function Page() {
  return (
    <PageContainer width="md" gap="none">
      <LegalPage doc="privacy" />
    </PageContainer>
  );
}
