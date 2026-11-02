import type { Metadata } from "next";
import { LegalPage } from "@/components/layout/legal-page";
import { PageContainer } from "@/components/ui/page";
import type { UiLocale } from "@/i18n/messages";
import { alternates } from "@/lib/seo";

export async function generateMetadata({ params }: PageProps<"/[locale]/terms">): Promise<Metadata> {
  const { locale } = await params;
  return { title: "Условия использования", alternates: alternates(locale as UiLocale, "/terms") };
}

export default function Page() {
  return (
    <PageContainer width="md" gap="none">
      <LegalPage doc="terms" />
    </PageContainer>
  );
}
