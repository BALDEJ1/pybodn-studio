import type { QueryClient } from "@tanstack/react-query"

import { setDraft } from "@/hooks/use-drafts"
import type { Draft } from "@/lib/form"
import { memoryKey, refresh, staleAfterChange } from "@/lib/queries"
import type { MemoryRecord } from "@/server/bridge/protocol.ts"

/**
 * What follows the page's own change to a memory: the cache takes the memory as the change left
 * it, its unsaved edits become `draft`, and the reads the change touches are read again. It
 * settles once those on screen are back.
 */
export function keepOwnChange(
  client: QueryClient,
  record: MemoryRecord,
  draft: Draft | undefined
): Promise<void> {
  client.setQueryData(memoryKey(record.namespace, record.id), record)
  setDraft(record.id, draft)
  return refresh(client, staleAfterChange(record.namespace))
}
