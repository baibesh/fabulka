"use client";

import {
  hashKey,
  useMutation as useTanstackMutation,
  useQuery as useTanstackQuery,
  type DefaultError,
  type QueryClient,
  type QueryKey,
  type UseMutateFunction,
  type UseMutationOptions,
  type UseMutationResult,
  type UseQueryOptions,
  type UseQueryResult,
} from "@tanstack/react-query";
import { createContext, useCallback, useContext, useRef } from "react";
import { useHydrated } from "@/hooks/use-hydrated";
import { variablesKey } from "./mutation-key";

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

/**
 * React Query's useMutation, but `mutate` ignores a call while the same call (the same variables) is
 * still running: a double click or a form sent twice before the button re-renders as busy does the
 * work once. Calls with other variables (another row, another choice) still go. Use it instead of
 * @tanstack's useMutation.
 */
export function useMutation<TData = unknown, TError = DefaultError, TVariables = void, TOnMutateResult = unknown>(
  options: UseMutationOptions<TData, TError, TVariables, TOnMutateResult>,
  queryClient?: QueryClient,
): UseMutationResult<TData, TError, TVariables, TOnMutateResult> {
  const result = useTanstackMutation(options, queryClient);
  const running = useRef(new Set<string>());
  const { mutateAsync } = result;
  const mutate = useCallback<UseMutateFunction<TData, TError, TVariables, TOnMutateResult>>(
    (...args) => {
      const key = variablesKey(args[0]);
      if (running.current.has(key)) return;
      running.current.add(key);
      mutateAsync(...args)
        .catch(() => {})
        .finally(() => running.current.delete(key));
    },
    [mutateAsync],
  );
  return { ...result, mutate };
}
