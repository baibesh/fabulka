import { useCallback, useSyncExternalStore } from "react";

/** Whether a media query matches, kept up to date; `server` until hydrated (the server cannot know). */
export function useMediaQuery(query: string, server = false): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => server);
}
