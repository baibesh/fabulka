"use client";

import { useQuery as useTanstackQuery, type DefaultError, type QueryKey, type UseQueryOptions, type UseQueryResult } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

const noSubscribe = () => () => undefined;

/** False while React hydrates server HTML, true from then on (and on every later client render). */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
}

/**
 * React Query's useQuery, but it reports "still loading" while its component hydrates. Parts of a
 * page hydrate one after another, and a query another part already finished would otherwise hand
 * this part data on its first render: text the server never rendered, a hydration error (React
 * #418) and the whole page re-rendered on the client. Use it instead of @tanstack's useQuery.
 */
export function useQuery<TQueryFnData = unknown, TError = DefaultError, TData = TQueryFnData, TQueryKey extends QueryKey = QueryKey>(
  options: UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
): UseQueryResult<TData, TError> {
  const result = useTanstackQuery(options);
  const hydrated = useHydrated();
  if (hydrated) return result;
  return {
    ...result,
    data: undefined,
    error: null,
    status: "pending",
    isPending: true,
    isLoading: result.fetchStatus === "fetching",
    isSuccess: false,
    isError: false,
    isLoadingError: false,
    isRefetchError: false,
    isPlaceholderData: false,
  } as UseQueryResult<TData, TError>;
}
