/** A key press, as far as Studio's keys care. */
export type Press = {
  key: string
  meta: boolean
  ctrl: boolean
  alt: boolean
  /** An input method is still putting a character together. */
  composing: boolean
  /** The keyboard is in a field that takes text. */
  typing: boolean
  /** A dialog, sheet or popover is open over the page. */
  overlaid: boolean
}

export type Shortcut = "search" | "new" | "archive" | "save"

const LETTERS: Readonly<Record<string, Shortcut>> = {
  "/": "search",
  n: "new",
  e: "archive",
}

/**
 * The shortcut a press stands for, if any. Save works from a field too; a plain letter there is
 * only text. Nothing works while something is open over the page.
 */
export function shortcutOf(press: Press): Shortcut | null {
  if (press.composing || press.overlaid) return null
  if (press.meta || press.ctrl) {
    return !press.alt && press.key.toLowerCase() === "s" ? "save" : null
  }
  if (press.typing || press.alt) return null
  return LETTERS[press.key.toLowerCase()] ?? null
}

/**
 * The row of `count` the keyboard moves to from row `at` (-1 for none), or null when the key does
 * not move it. The arrows stop at either end.
 */
export function rowAfter(
  key: string,
  at: number,
  count: number
): number | null {
  if (count === 0) return null
  switch (key) {
    case "ArrowDown":
      return Math.min(at + 1, count - 1)
    case "ArrowUp":
      return Math.max(at - 1, 0)
    case "Home":
      return 0
    case "End":
      return count - 1
    default:
      return null
  }
}

/** Ctrl+Enter or ⌘Enter, which sends a dialog from any of its fields. */
export function isCommandEnter(press: Press): boolean {
  return (
    press.key === "Enter" &&
    (press.meta || press.ctrl) &&
    !press.alt &&
    !press.composing
  )
}
