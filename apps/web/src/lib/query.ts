"use client";

import { hashKey, useQuery as useTanstackQuery, type DefaultError, type QueryKey, type UseQueryOptions, type UseQueryResult } from "@tanstack/react-query";
import { createContext, useContext } from "react";
import { useHydrated } from "@/hooks/use-hydrated";

export { useHydrated };

/**
 * Hashes of the queries the server fetched and rendered with (CountryScope hands them down with the
 * data): those are shown while hydrating, since the server HTML already has them.
 */
export const ServerQueries = createContext<ReadonlySet<string>>(new Set());

/**
 * React Query's useQuery, but it reports "still loading" while its component hydrates. Parts of a
 * page hydrate one after another, and a query another part already finished would otherwise hand
 * this part data on its first render: text the server never rendered, a hydration error (React
 * #418) and the whole page re-rendered on the client. Queries the server rendered with
 * (ServerQueries) are the exception. Use it instead of @tanstack's useQuery.
 */
export function useQuery<TQueryFnData = unknown, TError = DefaultError, TData = TQueryFnData, TQueryKey extends QueryKey = QueryKey>(
  options: UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
): UseQueryResult<TData, TError> {
  const result = useTanstackQuery(options);
  const hydrated = useHydrated();
  const fromServer = useContext(ServerQueries).has(hashKey(options.queryKey));
  if (hydrated || fromServer) return result;
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
