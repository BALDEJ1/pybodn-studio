import { queryOptions } from "@tanstack/react-query"

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

export const memoryQuery = (namespace: string, id: string) =>
  queryOptions({
    queryKey: ["memory", namespace, id],
    queryFn: () => callMemory("get", { namespace, id }),
    ...FRESH,
  })
