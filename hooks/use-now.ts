"use client"

import { useSyncExternalStore } from "react"

const TICK = 30_000

function subscribe(onTick: () => void) {
  const timer = setInterval(onTick, TICK)
  return () => clearInterval(timer)
}

// Rounded to the tick, so the time stays the same between ticks and the page renders once a tick.
const read = () => Math.floor(Date.now() / TICK) * TICK

/** The time now, moving on every 30 seconds: enough for labels such as "5 min ago". */
export function useNow(): Date {
  return new Date(useSyncExternalStore(subscribe, read, () => 0))
}
