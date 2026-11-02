"use client";

import { CONSENT_COOKIE, analyticsConfigured, type SeoAnalytics } from "@fabulka/shared";
import { usePathname } from "next/navigation";
import Script from "next/script";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { COOKIE_MAX_AGE } from "@/i18n/cookies";
import { useI18n } from "@/i18n/i18n";
import { LocaleLink } from "@/i18n/routing";
import { Button } from "../ui/button";

type Consent = "granted" | "denied" | null;

const CHANGE = "fabulka:consent";

/** Whether the banner was reopened from the footer, and whether analytics is set up at all. */
const state = { reopened: false, configured: false };

function readConsent(): Consent {
  try {
    const match = document.cookie.match(new RegExp(`(?:^|; )${CONSENT_COOKIE}=([^;]*)`));
    const value = match ? decodeURIComponent(match[1]) : null;
    return value === "granted" || value === "denied" ? value : null;
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE, onChange);
  return () => window.removeEventListener(CHANGE, onChange);
}

const changed = () => window.dispatchEvent(new Event(CHANGE));

/** The visitor's answer; "pending" while rendering on the server or hydrating (nothing is shown). */
function useConsent(): Consent | "pending" {
  return useSyncExternalStore(subscribe, readConsent, () => "pending" as const);
}

function useReopened(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => state.reopened,
    () => false,
  );
}

function saveConsent(value: "granted" | "denied") {
  const before = readConsent();
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${CONSENT_COOKIE}=${value}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax${secure}`;
  state.reopened = false;
  // Trackers already running cannot be unloaded: withdrawing consent reloads the page without them.
  if (before === "granted" && value === "denied") window.location.reload();
  else changed();
}

/**
 * Analytics (GTM, GA4, Yandex Metrika, Meta Pixel — the ids from the admin's SEO settings) on the
 * public site only: the admin has a root layout of its own and never renders this. Nothing loads
 * until the visitor accepts the banner; non-essential cookies are declined until then. The answer is
 * kept in a cookie (CONSENT_COOKIE) for a year and can be changed from the footer.
 */
export function Analytics({ analytics }: { analytics: SeoAnalytics }) {
  const configured = analyticsConfigured(analytics);
  const consent = useConsent();
  const reopened = useReopened();

  useEffect(() => {
    state.configured = configured;
    changed();
  }, [configured]);

  if (!configured || consent === "pending") return null;
  return (
    <>
      {consent === "granted" && <Trackers analytics={analytics} />}
      {(consent === null || reopened) && <ConsentBanner />}
    </>
  );
}

function ConsentBanner() {
  const { t } = useI18n();
  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label={t("consent.title")}
      data-testid="consent-banner"
      className="fixed inset-x-0 bottom-0 z-50 p-3 sm:p-4"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-lg sm:flex-row sm:items-center">
        <p className="flex-1 text-sm">
          {t("consent.text")}{" "}
          <LocaleLink href="/privacy" className="font-semibold text-accent hover:underline">
            {t("consent.more")}
          </LocaleLink>
        </p>
        <div className="flex shrink-0 gap-2">
          <Button variant="secondary" size="sm" data-testid="consent-decline" onClick={() => saveConsent("denied")}>
            {t("consent.decline")}
          </Button>
          <Button size="sm" data-testid="consent-accept" onClick={() => saveConsent("granted")}>
            {t("consent.accept")}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** "Cookie settings" in the footer: reopens the banner; shown only when analytics is set up. */
export function ConsentSettingsLink({ className }: { className?: string }) {
  const { t } = useI18n();
  const configured = useSyncExternalStore(
    subscribe,
    () => state.configured,
    () => false,
  );
  if (!configured) return null;
  return (
    <button
      type="button"
      data-testid="consent-settings"
      className={className}
      onClick={() => {
        state.reopened = true;
        changed();
      }}
    >
      {t("footer.cookies")}
    </button>
  );
}

declare global {
  interface Window {
    ym?: (id: number, action: string, ...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
    gtag?: (...args: unknown[]) => void;
  }
}

/** The trackers' scripts; the ids were checked by the API (SeoAnalyticsSchema), and are JSON-quoted anyway. */
function Trackers({ analytics }: { analytics: SeoAnalytics }) {
  const { gtm, ga4, yandexMetrika, metaPixel } = analytics;
  const pathname = usePathname();
  const first = useRef(true);

  // Which trackers this page started: on <html data-analytics>, for checks and debugging.
  useEffect(() => {
    const names = [gtm && "gtm", ga4 && "ga4", yandexMetrika && "metrika", metaPixel && "pixel"].filter(Boolean).join(" ");
    document.documentElement.dataset.analytics = names;
    return () => {
      delete document.documentElement.dataset.analytics;
    };
  }, [gtm, ga4, yandexMetrika, metaPixel]);

  // Client-side navigations: Metrika and the Pixel count a page view each (GA4 and GTM follow the
  // history themselves).
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (yandexMetrika) window.ym?.(Number(yandexMetrika), "hit", window.location.href);
    if (metaPixel) window.fbq?.("track", "PageView");
  }, [pathname, yandexMetrika, metaPixel]);

  const q = (value: string) => JSON.stringify(value);
  return (
    <>
      {gtm && (
        <Script id="fabulka-gtm" strategy="afterInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer',${q(gtm)});`}
        </Script>
      )}
      {ga4 && (
        <>
          <Script id="fabulka-ga4-src" src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ga4)}`} strategy="afterInteractive" />
          <Script id="fabulka-ga4" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());gtag('config',${q(ga4)});`}
          </Script>
        </>
      )}
      {yandexMetrika && (
        <Script id="fabulka-metrika" strategy="afterInteractive">
          {`(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};m[i].l=1*new Date();k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})(window,document,'script','https://mc.yandex.ru/metrika/tag.js','ym');ym(${Number(yandexMetrika)},'init',{clickmap:true,trackLinks:true,accurateTrackBounce:true});`}
        </Script>
      )}
      {metaPixel && (
        <Script id="fabulka-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init',${q(metaPixel)});fbq('track','PageView');`}
        </Script>
      )}
    </>
  );
}
