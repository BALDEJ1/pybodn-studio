"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"

import { announce } from "@/components/announcer"
import { ApiError, callMemory } from "@/lib/api"
import type { Outcome, Request } from "@/lib/new-memory"
import { refresh, staleAfterChange } from "@/lib/queries"
import type { MemoryRecord } from "@/server/bridge/protocol.ts"

import { keepOwnChange } from "../memory/own-change"

type Adding = { request: Request; outcome: Outcome }

/**
 * Adds a memory, creating its namespace with it, or replaces the memory that holds its key. Once
 * the lists have it, `onAdded` gets the memory.
 */
export function useAdd(onAdded: (record: MemoryRecord) => void) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ request }: Adding) =>
      request.method === "put"
        ? callMemory("put", request.params)
        : callMemory("add", request.params),
    onSuccess: async (record, { outcome }) => {
      // A replaced memory's unsaved edits were made on a text it no longer has. A new namespace
      // opens only once the file lists it; until then the page would move on.
      await keepOwnChange(client, record, undefined)
      announce(saidAfter(outcome, record))
      onAdded(record)
    },
    onError: (error, { request }) => {
      // The memory may or may not have been written; the lists show which.
      if (error instanceof ApiError && error.code === "unconfirmed") {
        void refresh(client, staleAfterChange(request.params.namespace))
      }
    },
  })
}

function saidAfter(outcome: Outcome, record: MemoryRecord): string {
  if (outcome === "create") return `Namespace ${record.namespace} created.`
  if (outcome === "replace") {
    return `Replaced the memory with key ${record.key ?? ""}.`
  }
  return "Memory added."
}
