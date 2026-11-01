import { useSyncExternalStore } from "react";

const noSubscribe = () => () => undefined;

/**
 * A value only the browser knows (the address, a media query read once), read without subscribing:
 * `server` while React hydrates server HTML, then `read()` on every client render.
 */
export function useClientValue<T>(read: () => T, server: T): T {
  return useSyncExternalStore(noSubscribe, read, () => server);
}

const yes = () => true;

/** False while React hydrates server HTML, true from then on (and on every later client render). */
export function useHydrated(): boolean {
  return useClientValue(yes, false);
}
