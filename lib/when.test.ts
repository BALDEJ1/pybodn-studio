import { describe, expect, test } from "vitest"

import { changedLabel, dayLabel } from "./when"

// Local time, as the page shows it: 24 November 2026, 9:30 in the morning.
const now = new Date(2026, 10, 24, 9, 30)

describe("when a memory changed", () => {
  test.each([
    ["seconds ago", new Date(2026, 10, 24, 9, 29, 30), "Just now"],
    [
      "a moment ahead of this computer's clock",
      new Date(2026, 10, 24, 9, 31),
      "Just now",
    ],
    ["a minute ago", new Date(2026, 10, 24, 9, 29), "1 min ago"],
    ["59 minutes ago", new Date(2026, 10, 24, 8, 31), "59 min ago"],
    ["an hour ago", new Date(2026, 10, 24, 8, 30), "1 h ago"],
    ["just after midnight today", new Date(2026, 10, 24, 0, 5), "9 h ago"],
    ["just before midnight", new Date(2026, 10, 23, 23, 55), "Yesterday"],
    ["early yesterday", new Date(2026, 10, 23, 0, 0), "Yesterday"],
    ["the day before yesterday", new Date(2026, 10, 22, 23, 59), "Nov 22"],
    ["last year", new Date(2025, 11, 30, 12, 0), "Dec 30, 2025"],
  ])("%s", (_, at, label) => {
    expect(changedLabel(at, now)).toBe(label)
  })

  test("minutes win over the day: 40 minutes ago is not yesterday", () => {
    const justAfterMidnight = new Date(2026, 10, 24, 0, 20)

    expect(
      changedLabel(new Date(2026, 10, 23, 23, 40), justAfterMidnight)
    ).toBe("40 min ago")
  })

  test("yesterday reaches back across the new year", () => {
    const newYear = new Date(2027, 0, 1, 8, 0)

    expect(changedLabel(new Date(2026, 11, 31, 20, 0), newYear)).toBe(
      "Yesterday"
    )
  })
})

describe("a day", () => {
  test("of this year has no year", () => {
    expect(dayLabel(new Date(2026, 11, 3), now)).toBe("Dec 3")
  })

  test("of another year has its year", () => {
    expect(dayLabel(new Date(2027, 0, 3), now)).toBe("Jan 3, 2027")
  })
})
