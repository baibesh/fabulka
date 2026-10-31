import {
  GENERATION_PAUSED,
  LIMIT_REACHED,
  PASSWORD_LOGIN_DISABLED,
  REGION_UNAVAILABLE,
  VOICE_DISABLED,
  VOICE_RATE_LIMITED,
  type ClientErrorReport,
} from "@fabulka/shared";
import { clientKey } from "./api";

/** Codes the visitor is meant to see (limits, pauses, closed features): not bugs. */
const EXPECTED = new Set<string>([LIMIT_REACHED, GENERATION_PAUSED, VOICE_RATE_LIMITED, VOICE_DISABLED, REGION_UNAVAILABLE, PASSWORD_LOGIN_DISABLED]);
/** Reports one page load sends at most, whatever goes wrong. */
const MAX_REPORTS = 20;

/** What this page load already sent: the same error is reported once. */
const sent = new Set<string>();
/** Errors request() already reported, so an unhandled rejection of one is not sent again. */
const reported = new WeakSet<object>();

/** Ids in a path become ":id", so one bug on many books is one line in the journal. */
function normalize(path: string): string {
  return path.split("?")[0].replace(/\/[a-z0-9]{20,}(?=\/|$)/gi, "/:id");
}

/**
 * Tells the API about an error the visitor saw. Never throws and never sends form values: only the
 * message, the page path (no query string) and the API's error code.
 */
export function reportError(report: Omit<ClientErrorReport, "path" | "locale">): void {
  try {
    const message = report.message.trim().slice(0, 500);
    const path = normalize(window.location.pathname).slice(0, 200) || "/";
    const key = `${report.kind}\n${path}\n${message}`;
    if (!message || sent.has(key) || sent.size >= MAX_REPORTS) return;
    sent.add(key);
    const body: ClientErrorReport = { ...report, message, path, locale: document.documentElement.lang || undefined };
    // keepalive: the report still goes out when the error makes the visitor leave the page.
    void fetch("/api/telemetry/error", {
      method: "POST",
      keepalive: true,
      headers: { "content-type": "application/json", "x-client-key": clientKey() },
      body: JSON.stringify(body),
    }).catch(() => undefined);
  } catch {
    // Reporting must never add a second error.
  }
}

/** A failed API answer the visitor sees: 5xx, or a 4xx with an error code that is not expected. */
export function reportApiError(method: string, path: string, error: Error & { status: number; code?: string }): void {
  reported.add(error);
  if (error.code && EXPECTED.has(error.code)) return;
  if (error.status < 500 && !error.code) return;
  reportError({ kind: "api", message: `${method} ${normalize(path)}: ${error.message}`, status: error.status, code: error.code });
}

/** The API could not be reached at all (offline, a deploy restarting it). */
export function reportNetworkError(method: string, path: string, error: unknown): void {
  if (error instanceof Error) reported.add(error);
  if (error instanceof DOMException && error.name === "AbortError") return;
  const message = error instanceof Error ? error.message : String(error);
  reportError({ kind: "api", message: `${method} ${normalize(path)}: ${message}`, code: "network" });
}

/** Listens for uncaught errors and rejections; returns the cleanup. Mounted once, in Providers. */
export function installErrorReporting(): () => void {
  const onError = (event: ErrorEvent) => {
    // "Script error." carries nothing (a cross-origin script); the ResizeObserver note is harmless.
    if (!event.message || event.message === "Script error." || event.message.startsWith("ResizeObserver loop")) return;
    reportError({ kind: "js", message: event.message });
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    const reason: unknown = event.reason;
    if (typeof reason === "object" && reason !== null && reported.has(reason)) return;
    const message = reason instanceof Error ? reason.message : String(reason);
    reportError({ kind: "unhandled", message });
  };
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}
