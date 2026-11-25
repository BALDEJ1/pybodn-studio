import {
  queryOptions,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query"

import type { View } from "@/server/bridge/protocol.ts"

import { callMemory } from "./api"

const REFRESH = 5_000

// Another program may write the file while Studio is open, so what is on screen is read again
// every few seconds while the tab is visible, and as soon as the person comes back to it. A read
// that failed waits for "Retry" or for the person to come back, since it would mostly fail again.
const FRESH = {
  refetchInterval: (query: { state: { status: string } }) =>
    query.state.status === "error" ? false : REFRESH,
  refetchOnWindowFocus: true,
} as const

export const overviewQuery = queryOptions({
  queryKey: ["overview"],
  queryFn: () => callMemory("overview", {}),
  ...FRESH,
})

export const listQuery = (namespace: string, view: View) =>
  queryOptions({
    queryKey: ["list", namespace, view],
    queryFn: () => callMemory("list", { namespace, view }),
    ...FRESH,
  })

/**
 * Every match of `query` in each tab. No matches of other words stand in while these are looked
 * up: they could be from a search already cleared. The server is on this computer and answers
 * within milliseconds.
 */
export const searchQuery = (namespace: string, query: string) =>
  queryOptions({
    queryKey: ["search", namespace, query],
    queryFn: () => callMemory("search", { namespace, query }),
    ...FRESH,
  })

export const memoryKey = (namespace: string, id: string) =>
  ["memory", namespace, id] as const

export const memoryQuery = (namespace: string, id: string) =>
  queryOptions({
    queryKey: memoryKey(namespace, id),
    queryFn: () => callMemory("get", { namespace, id }),
    ...FRESH,
  })

/** The memory that holds `key` in `namespace`, archived and expired ones included, or null. */
export const keyOwnerQuery = (namespace: string, key: string) =>
  queryOptions({
    queryKey: ["key_owner", namespace, key],
    queryFn: () => callMemory("key_owner", { namespace, key }),
  })

/**
 * The reads a change in `namespace` can leave out of date: the counts of every namespace, and the
 * tabs and searches of this one. The memory changed comes back with the change itself.
 */
export function staleAfterChange(namespace: string): QueryKey[] {
  return [overviewQuery.queryKey, ["list", namespace], ["search", namespace]]
}

/** Reads `keys` again; it settles once those on screen are back. */
export async function refresh(
  client: QueryClient,
  keys: readonly QueryKey[]
): Promise<void> {
  await Promise.all(
    keys.map((queryKey) => client.invalidateQueries({ queryKey }))
  )
}
