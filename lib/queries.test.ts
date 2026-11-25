import { environmentManager, QueryClient } from "@tanstack/react-query"
import { afterEach, expect, test, vi } from "vitest"

import type { MemoryRecord } from "@/server/bridge/protocol.ts"

import { memoryKey, memoryQuery, refresh, staleAfterChange } from "./queries"

afterEach(() => {
  vi.useRealTimers()
  environmentManager.setIsServer(() => typeof window === "undefined")
})

test("a change in a namespace refreshes the counts and its own lists, and nothing of another", async () => {
  const client = new QueryClient()
  const keys = {
    counts: ["overview"],
    tab: ["list", "user:alice", "archived"],
    search: ["search", "user:alice", "peanuts"],
    otherTab: ["list", "user:alicia", "active"],
    otherSearch: ["search", "user:bob", "peanuts"],
    memory: memoryKey("user:alice", "3f9a"),
  }
  for (const key of Object.values(keys)) client.setQueryData(key, {})

  await Promise.all(
    staleAfterChange("user:alice").map((queryKey) =>
      client.invalidateQueries({ queryKey })
    )
  )

  const stale = Object.entries(keys)
    .filter(([, key]) => client.getQueryState(key)?.isInvalidated)
    .map(([name]) => name)
  expect(stale).toEqual(["counts", "tab", "search"])
})

test("a change across the file refreshes the counts and the lists of every namespace", async () => {
  const client = new QueryClient()
  const keys = {
    counts: ["overview"],
    tab: ["list", "user:alice", "expired"],
    otherSearch: ["search", "user:bob", "peanuts"],
    memory: memoryKey("user:alice", "3f9a"),
  }
  for (const key of Object.values(keys)) client.setQueryData(key, {})

  await refresh(client, staleAfterChange(null))

  const stale = Object.entries(keys)
    .filter(([, key]) => client.getQueryState(key)?.isInvalidated)
    .map(([name]) => name)
  expect(stale).toEqual(["counts", "tab", "otherSearch"])
})

test("a memory read stays while the tab is open, after nothing shows it, so edits left in it can be matched to it later", async () => {
  // In a browser, unlike here, the library forgets a read nothing has shown for 5 minutes.
  environmentManager.setIsServer(() => false)
  vi.useFakeTimers()
  const client = new QueryClient()
  const record = { id: "3f9a", status: "expired" } as MemoryRecord
  const key = memoryKey("user:alice", "3f9a")

  await client.fetchQuery({
    ...memoryQuery("user:alice", "3f9a"),
    queryFn: () => Promise.resolve(record),
  })
  vi.advanceTimersByTime(60 * 60_000)

  expect(client.getQueryData(key)).toBe(record)
})
