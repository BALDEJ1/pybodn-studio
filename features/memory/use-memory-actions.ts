"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"

import { announce } from "@/components/announcer"
import { notify } from "@/components/toaster"
import { readDraft, setDraft } from "@/hooks/use-drafts"
import { callMemory } from "@/lib/api"
import { afterOwnChange } from "@/lib/form"
import { refresh, staleAfterChange } from "@/lib/queries"
import type { MemoryRecord } from "@/server/bridge/protocol.ts"

import { keepOwnChange } from "./own-change"

export type Moves = {
  /** The memory left the tab open, so another takes its place. */
  onLeave: (id: string) => void
  /** The memory is to be shown where it now is. */
  onShow: (record: MemoryRecord) => void
}

/**
 * Archive, Restore and Delete for one memory. Archive and Restore keep the edits left unsaved in
 * it, on the version they return, so the page's own change is never taken for someone else's.
 */
export function useMemoryActions(
  record: MemoryRecord,
  { onLeave, onShow }: Moves
) {
  const client = useQueryClient()
  const { namespace, id } = record
  const failed = (error: Error) => notify(error.message)
  const keep = (changed: MemoryRecord) =>
    keepOwnChange(client, changed, afterOwnChange(readDraft(id), changed))

  // Undo comes from a toast, so it may run after the person has moved on to another memory.
  const restore = useMutation<MemoryRecord, Error, { undoing: boolean }>({
    mutationFn: () => callMemory("restore", { namespace, id }),
    onSuccess: async (restored, { undoing }) => {
      await keep(restored)
      if (undoing) {
        onShow(restored)
        announce("Archive undone.")
      } else {
        onLeave(id)
        notify("Memory restored. It is under Active.")
      }
    },
    onError: failed,
  })

  const archive = useMutation({
    mutationFn: () => callMemory("archive", { namespace, id }),
    onSuccess: async (archived) => {
      await keep(archived)
      onLeave(id)
      notify("Memory archived.", {
        label: "Undo",
        onClick: () => restore.mutate({ undoing: true }),
      })
    },
    onError: failed,
  })

  const remove = useMutation<unknown, Error, { lastInNamespace: boolean }>({
    mutationFn: () => callMemory("delete", { namespace, id }),
    onSuccess: async (_, { lastInNamespace }) => {
      setDraft(id, undefined)
      // Once the file no longer lists an emptied namespace, the page opens another one.
      await refresh(client, staleAfterChange(namespace))
      onLeave(id)
      notify(
        lastInNamespace
          ? `Memory deleted. ${namespace} is gone with it.`
          : "Memory deleted."
      )
    },
    onError: failed,
  })

  const isPending = archive.isPending || restore.isPending || remove.isPending
  return {
    archive: () => archive.mutate(),
    // Restore sits in the band, not beside the others, so a second press waits here.
    restore: () => {
      if (!isPending) restore.mutate({ undoing: false })
    },
    remove: (lastInNamespace: boolean) => remove.mutate({ lastInNamespace }),
    isPending,
  }
}
