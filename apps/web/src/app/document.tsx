import { Nunito } from "next/font/google";
import "flag-icons/css/flag-icons.min.css";
import "./globals.css";

// cyrillic-ext carries the Kazakh letters (ә ғ қ ң ө ұ ү һ і).
const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin", "cyrillic", "cyrillic-ext"],
});

/**
 * <html> and <body> for each root layout: the site's ([locale], in its language), the admin's and
 * the global 404.
 */
export function Document({ lang, children }: { lang: string; children: React.ReactNode }) {
  return (
    <html lang={lang} className={`${nunito.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
