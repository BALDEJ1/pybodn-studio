/** A key press, as far as Studio's keys care. */
export type Press = {
  key: string
  /** Where the key stands, named after the US layout, such as "KeyN". */
  code: string
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

// A letter outside the Latin alphabet, as Ukrainian or Greek layouts give.
const OTHER_LETTER = /^(?![a-z])\p{L}$/iu
const LETTER_KEY = /^Key([A-Z])$/

/**
 * The shortcut a press stands for, if any. Save works from a field too; a plain letter there is
 * only text. Nothing works while something is open over the page.
 */
export function shortcutOf(press: Press): Shortcut | null {
  if (press.composing || press.overlaid) return null
  const key = latinKey(press)
  if (press.meta || press.ctrl) return !press.alt && key === "s" ? "save" : null
  if (press.typing || press.alt) return null
  return LETTERS[key] ?? null
}

/**
 * The key in lower case. On a layout of other letters the shortcuts go by where the key stands,
 * so N is the key that gives N on a US layout; on a Latin one they go by the letter itself.
 */
function latinKey({ key, code }: Press): string {
  const standing = LETTER_KEY.exec(code)
  if (OTHER_LETTER.test(key) && standing) return standing[1].toLowerCase()
  return key.toLowerCase()
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
