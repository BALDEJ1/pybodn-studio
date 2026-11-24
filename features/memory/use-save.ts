"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"

import { announce } from "@/components/announcer"
import { canRetry } from "@/components/failure"
import { notify } from "@/components/toaster"
import { readDraft, setDraft } from "@/hooks/use-drafts"
import { ApiError, callMemory } from "@/lib/api"
import {
  changesOf,
  fieldOf,
  problemsOf,
  rebase,
  type Draft,
  type Field,
} from "@/lib/form"
import { memoryKey, staleAfterChange } from "@/lib/queries"
import type { MemoryRecord } from "@/server/bridge/protocol.ts"

import { VIEW_NAMES } from "../memories/view-names"

/** A field the library refused, with its reason. */
export type Rejection = { field: Field; message: string }

type Save = { record: MemoryRecord; draft: Draft }

/**
 * Saves the draft of one memory. The version the edits were made on goes with them, so the library
 * refuses the save when someone else changed the memory first.
 */
export function useSave(
  namespace: string,
  id: string,
  onRejected: (rejection: Rejection) => void
) {
  const client = useQueryClient()
  const key = memoryKey(namespace, id)

  const save = useMutation({
    mutationFn: async ({ record, draft }: Save) => {
      // A refresh that left before the save would bring back the version before it.
      await client.cancelQueries({ queryKey: key })
      return callMemory("update", {
        namespace,
        id,
        expected_version: draft.version,
        changes: changesOf(record, draft),
      })
    },
    onSuccess: (saved, { record }) => {
      client.setQueryData(key, saved)
      // Edits typed while the save was on its way stay, on the version just saved.
      setDraft(id, rebase(readDraft(id), saved))
      refresh(staleAfterChange(namespace))
      if (saved.status === record.status) announce("Saved.")
      else notify(`Saved. It is now under ${VIEW_NAMES[saved.status]}.`)
    },
    onError: (error) => {
      const code = error instanceof ApiError ? error.code : null
      if (code === "conflict") {
        // The newer version comes in, and the editor offers to keep or drop the edits.
        refresh([key])
        announce("Not saved: this memory changed elsewhere.")
        return
      }
      if (code === "not_found") {
        refresh([key, ...staleAfterChange(namespace)])
        return
      }
      const field = code === "invalid" ? fieldOf(error.message) : null
      if (field) {
        onRejected({ field, message: error.message })
        return
      }
      notify(
        error.message,
        canRetry(error) ? { label: "Retry", onClick: saveLatest } : undefined
      )
    },
  })

  function refresh(keys: readonly (readonly unknown[])[]) {
    for (const queryKey of keys) void client.invalidateQueries({ queryKey })
  }

  /** Saves the draft as it is now, on the memory as it is now. */
  function saveLatest() {
    const draft = readDraft(id)
    const record = client.getQueryData<MemoryRecord>(key)
    if (!draft || !record) return
    if (Object.keys(problemsOf(draft.edits)).length > 0) return
    save.mutate({ record, draft })
  }

  return save
}
