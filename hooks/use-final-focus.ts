"use client"

import { useLayoutEffect, useRef } from "react"

import { isOverlaid, isShown } from "@/lib/focus"

/**
 * Where a dialog gives the keyboard back as it closes: to what had it when the dialog opened, while
 * that is still in sight. Otherwise nowhere, and the page takes it to the nearest row, rather than
 * Base UI to whatever had it before, such as the button of a sheet long closed.
 */
export function useFinalFocus(open: boolean): () => HTMLElement | false {
  const opener = useRef<HTMLElement | null>(null)
  // Before Base UI moves the keyboard into the dialog, which it does once this commit is over.
  useLayoutEffect(() => {
    if (!open) return
    const active = document.activeElement
    opener.current =
      active instanceof HTMLElement && active !== document.body ? active : null
  }, [open])
  return () => {
    // Another dialog that opened meanwhile, such as "Erasing…", keeps the keyboard.
    if (isOverlaid()) return false
    return isShown(opener.current) ? opener.current : false
  }
}
