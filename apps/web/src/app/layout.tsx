import type { Metadata } from "next";
import { Nunito } from "next/font/google";
import { Providers } from "./providers";
import "flag-icons/css/flag-icons.min.css";
import "./globals.css";

// cyrillic-ext carries the Kazakh letters (ә ғ қ ң ө ұ ү һ і).
const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin", "cyrillic", "cyrillic-ext"],
});

const description =
  "Персональная детская книга, где ваш ребёнок — главный герой: сказка по детской методике и иллюстрации — на казахском, русском, английском, испанском или немецком. Powered by Meta Muse models.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? "https://fabulka.com"),
  title: { default: "Fabulka — книга, где ваш ребёнок главный герой", template: "%s · Fabulka" },
  description,
  openGraph: {
    type: "website",
    siteName: "Fabulka",
    title: "Fabulka — книга, где ваш ребёнок главный герой",
    description,
    images: [{ url: "/og.jpg", width: 1200, height: 630 }],
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className={`${nunito.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
