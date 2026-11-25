import { QueryClient } from "@tanstack/react-query"
import { expect, test } from "vitest"

import { memoryKey, staleAfterChange } from "./queries"

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
