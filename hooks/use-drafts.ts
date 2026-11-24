"use client"

import { useEffect, useSyncExternalStore } from "react"

import type { Draft } from "@/lib/form"

// The unsaved edits of each memory, by id, for as long as the tab is open: the person can open
// another memory and come back to their edits.
let drafts: ReadonlyMap<string, Draft> = new Map()
const listeners = new Set<() => void>()

function subscribe(onChange: () => void) {
  listeners.add(onChange)
  return () => {
    listeners.delete(onChange)
  }
}

/** The draft as it is now, for code that runs after a render, such as the end of a save. */
export function readDraft(id: string): Draft | undefined {
  return drafts.get(id)
}

/** Keeps `draft` as the edits of memory `id`; none drops them. */
export function setDraft(id: string, draft: Draft | undefined): void {
  if (drafts.get(id) === draft) return
  const next = new Map(drafts)
  if (draft) next.set(id, draft)
  else next.delete(id)
  drafts = next
  for (const listener of listeners) listener()
}

export function useDraft(id: string): Draft | undefined {
  return useSyncExternalStore(
    subscribe,
    () => drafts.get(id),
    () => undefined
  )
}

/** While any memory has unsaved edits, the browser asks before the tab closes or reloads. */
export function useLeaveWarning(): void {
  const unsaved = useSyncExternalStore(
    subscribe,
    () => drafts.size > 0,
    () => false
  )
  useEffect(() => {
    if (!unsaved) return
    const ask = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener("beforeunload", ask)
    return () => window.removeEventListener("beforeunload", ask)
  }, [unsaved])
}
