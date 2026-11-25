"use client"

import {
  focusManager,
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query"

import { notify } from "@/components/toaster"
import { setDraft } from "@/hooks/use-drafts"
import { callMemory } from "@/lib/api"
import { refresh, staleAfterChange } from "@/lib/queries"
import type { MemoryRecord } from "@/server/bridge/protocol.ts"

/**
 * Deleting the expired memories of the whole file, and erasing deleted data from it. `onPurged`
 * gets the memories read before that were expired, and so are gone now.
 */
export function useUpkeep(onPurged: (gone: ReadonlySet<string>) => void) {
  const client = useQueryClient()
  const failed = (error: Error) => notify(error.message)

  const purge = useMutation({
    mutationFn: () => callMemory("purge_expired", {}),
    onSuccess: async ({ purged }) => {
      const gone = expiredRead(client)
      // Their unsaved edits have no memory left to be saved to.
      for (const id of gone) setDraft(id, undefined)
      await refresh(client, staleAfterChange(null))
      onPurged(gone)
      notify(
        purged === 1
          ? "1 expired memory deleted."
          : `${purged} expired memories deleted.`
      )
    },
    onError: failed,
  })

  const erase = useMutation({
    mutationFn: async () => {
      // The file is held until the rewrite ends, so reads every few seconds would only queue up
      // behind it. Coming back from "not focused" reads everything again.
      focusManager.setFocused(false)
      try {
        return await callMemory("erase_deleted", {})
      } finally {
        focusManager.setFocused(undefined)
      }
    },
    onSuccess: () => notify("Deleted data erased from the file."),
    onError: failed,
  })

  return { purge, erase }
}

function expiredRead(client: QueryClient): ReadonlySet<string> {
  const read = client.getQueriesData<MemoryRecord>({ queryKey: ["memory"] })
  return new Set(
    read.flatMap(([, record]) =>
      record?.status === "expired" ? [record.id] : []
    )
  )
}
