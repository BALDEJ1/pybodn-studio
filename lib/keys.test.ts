import { describe, expect, test } from "vitest"

import { isCommandEnter, rowAfter, shortcutOf, type Press } from "./keys"

const plain: Press = {
  key: "",
  meta: false,
  ctrl: false,
  alt: false,
  composing: false,
  typing: false,
  overlaid: false,
}

const press = (key: string, more: Partial<Press> = {}): Press => ({
  ...plain,
  key,
  ...more,
})

describe("a shortcut", () => {
  test("/ searches, N adds and E archives or restores, in either case", () => {
    expect(shortcutOf(press("/"))).toBe("search")
    expect(shortcutOf(press("n"))).toBe("new")
    expect(shortcutOf(press("N"))).toBe("new")
    expect(shortcutOf(press("e"))).toBe("archive")
    expect(shortcutOf(press("E"))).toBe("archive")
  })

  test("Ctrl+S and ⌘S save, in a field too", () => {
    expect(shortcutOf(press("s", { ctrl: true }))).toBe("save")
    expect(shortcutOf(press("S", { meta: true, typing: true }))).toBe("save")
  })

  test("a letter typed into a field is only text", () => {
    expect(shortcutOf(press("n", { typing: true }))).toBeNull()
    expect(shortcutOf(press("/", { typing: true }))).toBeNull()
    expect(shortcutOf(press("e", { typing: true }))).toBeNull()
  })

  test("no key works while a dialog, sheet or popover is over the page", () => {
    expect(shortcutOf(press("n", { overlaid: true }))).toBeNull()
    expect(
      shortcutOf(press("s", { meta: true, typing: true, overlaid: true }))
    ).toBeNull()
  })

  test("a letter an input method is still putting together does nothing", () => {
    expect(shortcutOf(press("n", { composing: true }))).toBeNull()
    expect(shortcutOf(press("s", { ctrl: true, composing: true }))).toBeNull()
  })

  test("a letter held with Ctrl, ⌘ or Alt is the browser's or the system's", () => {
    expect(shortcutOf(press("n", { ctrl: true }))).toBeNull()
    expect(shortcutOf(press("e", { meta: true }))).toBeNull()
    expect(shortcutOf(press("n", { alt: true }))).toBeNull()
    expect(shortcutOf(press("s", { ctrl: true, alt: true }))).toBeNull()
  })

  test("any other key is no shortcut", () => {
    expect(shortcutOf(press("a"))).toBeNull()
    expect(shortcutOf(press("Enter"))).toBeNull()
    expect(shortcutOf(press("Escape"))).toBeNull()
  })
})

describe("the row a key moves to", () => {
  test("the arrows go one row down or up", () => {
    expect(rowAfter("ArrowDown", 1, 5)).toBe(2)
    expect(rowAfter("ArrowUp", 1, 5)).toBe(0)
  })

  test("they stop at the first and the last row", () => {
    expect(rowAfter("ArrowUp", 0, 5)).toBe(0)
    expect(rowAfter("ArrowDown", 4, 5)).toBe(4)
  })

  test("Home and End go to the first and the last row", () => {
    expect(rowAfter("Home", 3, 5)).toBe(0)
    expect(rowAfter("End", 0, 5)).toBe(4)
  })

  test("from outside the rows, the arrows start at the first", () => {
    expect(rowAfter("ArrowDown", -1, 5)).toBe(0)
    expect(rowAfter("ArrowUp", -1, 5)).toBe(0)
  })

  test("other keys, and an empty list, move nothing", () => {
    expect(rowAfter("ArrowLeft", 1, 5)).toBeNull()
    expect(rowAfter("Tab", 1, 5)).toBeNull()
    expect(rowAfter("ArrowDown", -1, 0)).toBeNull()
  })
})

describe("Ctrl+Enter or ⌘Enter", () => {
  test("sends the dialog, from any of its fields", () => {
    expect(isCommandEnter(press("Enter", { ctrl: true, typing: true }))).toBe(
      true
    )
    expect(isCommandEnter(press("Enter", { meta: true, overlaid: true }))).toBe(
      true
    )
  })

  test("plain Enter, Alt with it, or a word still being put together does not", () => {
    expect(isCommandEnter(press("Enter"))).toBe(false)
    expect(isCommandEnter(press("Enter", { ctrl: true, alt: true }))).toBe(
      false
    )
    expect(
      isCommandEnter(press("Enter", { meta: true, composing: true }))
    ).toBe(false)
  })
})
