"use client"

import { useEffect, useEffectEvent } from "react"

import { isOverlaid } from "@/lib/focus"
import { shortcutOf, type Press, type Shortcut } from "@/lib/keys"

// Inputs that take no typed text, such as the slider's, leave the letters to the shortcuts.
const NOT_TEXT = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
])

/** A key press, with what the shortcuts need to know about where it happened. */
export function pressOf(event: KeyboardEvent): Press {
  const target = event.target instanceof Element ? event.target : null
  return {
    key: event.key,
    code: event.code,
    meta: event.metaKey,
    ctrl: event.ctrlKey,
    alt: event.altKey,
    composing: event.isComposing,
    typing: target !== null && takesText(target),
    overlaid: isOverlaid(),
  }
}

function takesText(element: Element): boolean {
  if (element instanceof HTMLInputElement) return !NOT_TEXT.has(element.type)
  return (
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement ||
    (element instanceof HTMLElement && element.isContentEditable)
  )
}

/** Runs `onPress` on `shortcut`, in place of what the browser would do with the key. */
export function useShortcut(shortcut: Shortcut, onPress: () => void): void {
  const handle = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || shortcutOf(pressOf(event)) !== shortcut) {
      return
    }
    event.preventDefault()
    onPress()
  })
  useEffect(() => {
    window.addEventListener("keydown", handle)
    return () => window.removeEventListener("keydown", handle)
  }, [])
}
