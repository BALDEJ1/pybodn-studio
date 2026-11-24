"use client"

import { useSyncExternalStore } from "react"

// What screen readers were last told, and how many times something was said. The same words twice
// in a row still change the text, so they are read out again.
let said = { text: "", count: 0 }
const listeners = new Set<() => void>()

const NO_BREAK_SPACE = String.fromCodePoint(0xa0)

function subscribe(onChange: () => void) {
  listeners.add(onChange)
  return () => {
    listeners.delete(onChange)
  }
}

/** Tells screen readers what an action did, when nothing on screen says it out loud. */
export function announce(text: string): void {
  said = { text, count: said.count + 1 }
  for (const listener of listeners) listener()
}

/** The region screen readers read the announcements from, hidden from the eye. */
export function Announcer() {
  const { text, count } = useSyncExternalStore(
    subscribe,
    () => said,
    () => said
  )
  return (
    <div role="status" className="sr-only">
      {text}
      {count % 2 === 1 ? NO_BREAK_SPACE : ""}
    </div>
  )
}
