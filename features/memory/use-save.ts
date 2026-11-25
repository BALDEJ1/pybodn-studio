"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"

import { announce } from "@/components/announcer"
import { notify } from "@/components/toaster"
import { readDraft, setDraft } from "@/hooks/use-drafts"
import { ApiError, callMemory, canRetry } from "@/lib/api"
import {
  afterSave,
  changesOf,
  FIELDS,
  fieldOf,
  problemsOf,
  type Draft,
  type Field,
} from "@/lib/form"
import { memoryKey, refresh, staleAfterChange } from "@/lib/queries"
import { VIEW_NAMES } from "@/lib/view-names"
import type { MemoryRecord } from "@/server/bridge/protocol.ts"

/** A field the library refused, with its reason. */
export type Rejection = { field: Field; message: string }

type Options = {
  onRejected: (rejection: Rejection) => void
  onSaved: () => void
}

type Sent = { record: MemoryRecord; draft: Draft }

/**
 * Saves the draft of one memory. The version the edits were made on goes with them, so the library
 * refuses the save when someone else changed the memory first.
 */
export function useSave(
  namespace: string,
  id: string,
  { onRejected, onSaved }: Options
) {
  const client = useQueryClient()
  const key = memoryKey(namespace, id)
  const mutationKey = ["save", namespace, id]

  const mutation = useMutation({
    mutationKey,
    mutationFn: async ({ record, draft }: Sent) => {
      // A refresh that left before the save would bring back the version before it.
      await client.cancelQueries({ queryKey: key })
      return callMemory("update", {
        namespace,
        id,
        expected_version: draft.version,
        changes: changesOf(record, draft),
      })
    },
    onSuccess: (saved, { record, draft }) => {
      client.setQueryData(key, saved)
      setDraft(id, afterSave(readDraft(id), draft, saved))
      void refresh(client, staleAfterChange(namespace))
      if (saved.status === record.status) announce("Saved.")
      else notify(`Saved. It is now under ${VIEW_NAMES[saved.status]}.`)
      onSaved()
    },
    onError: (error) => {
      const code = error instanceof ApiError ? error.code : null
      if (code === "conflict") {
        // The newer version comes in, and the editor offers to keep or drop the edits.
        void refresh(client, [key])
        announce("Not saved: this memory changed elsewhere.")
        return
      }
      if (code === "not_found") {
        void refresh(client, [key, ...staleAfterChange(namespace)])
        return
      }
      const field = code === "invalid" ? fieldOf(error.message) : null
      if (field) {
        onRejected({ field, message: error.message })
        return
      }
      notify(
        error.message,
        canRetry(error) ? { label: "Retry", onClick: save } : undefined
      )
    },
  })

  /**
   * Saves the draft as it is now, on the memory as it is now. A field the library would refuse is
   * returned instead, for the keyboard to go there.
   */
  function save(): Field | null {
    const draft = readDraft(id)
    const record = client.getQueryData<MemoryRecord>(key)
    if (!draft || !record || client.isMutating({ mutationKey }) > 0) return null
    const problems = problemsOf(draft.edits)
    const bad = FIELDS.find((field) => problems[field] !== undefined)
    if (bad) return bad
    mutation.mutate({ record, draft })
    return null
  }

  return { save, isPending: mutation.isPending }
}
