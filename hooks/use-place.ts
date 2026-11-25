"use client"

import { useCallback, useMemo, useSyncExternalStore } from "react"

import { addressOf, placeOf, type Place } from "@/lib/place"

// Next.js's useSearchParams follows the address a moment later, in the background, and the
// search field then drops letters typed in between. The address is read here at once instead.
const listeners = new Set<() => void>()

// Marks the entries of the browser's history that Studio added, so its own Back knows that the
// entry before is also Studio's.
const STUDIO = "pybodnStudio"

function subscribe(onChange: () => void) {
  listeners.add(onChange)
  window.addEventListener("popstate", onChange)
  return () => {
    listeners.delete(onChange)
    window.removeEventListener("popstate", onChange)
  }
}

function addedByStudio(): boolean {
  return Boolean(window.history.state?.[STUDIO])
}

/**
 * The place in the page's address, and ways to move. Each step is a new entry in the browser's
 * history, so Back returns to it; typing a search replaces the entry instead.
 */
export function usePlace() {
  const search = useSyncExternalStore(
    subscribe,
    () => window.location.search,
    () => ""
  )
  const place = useMemo(() => placeOf(new URLSearchParams(search)), [search])

  const go = useCallback((next: Place, { replace = false } = {}) => {
    const address = addressOf(next) || window.location.pathname
    // A new object each time: Next.js adds its own fields to it.
    if (replace) {
      window.history.replaceState({ [STUDIO]: addedByStudio() }, "", address)
    } else {
      window.history.pushState({ [STUDIO]: true }, "", address)
    }
    for (const listener of listeners) listener()
  }, [])

  /**
   * Back to where the person was, as the browser's Back would. A page opened from a link has
   * nothing of Studio's before it, so `fallback` takes its place instead.
   */
  const back = useCallback(
    (fallback: Place) => {
      if (addedByStudio()) window.history.back()
      else go(fallback, { replace: true })
    },
    [go]
  )

  return { place, go, back }
}

export type Go = ReturnType<typeof usePlace>["go"]

/**
 * Whether the address still holds `place`. A step that ends late, such as a delete, moves the
 * person only if they have not moved on since.
 */
export function isStillAt(place: Place): boolean {
  const now = placeOf(new URLSearchParams(window.location.search))
  return addressOf(now) === addressOf(place)
}
