import { describe, expect, test } from "vitest"

import { dateOfDay, dayOf, dayOfDate, momentOf } from "./expiry"

// Local time, as the page shows it, so these hold in every time zone.
const startOfNov25 = new Date(2026, 10, 25)

describe("an expiry date picked by day", () => {
  test("starts at the first moment of that day where the person is", () => {
    expect(momentOf("2026-11-25")).toBe(startOfNov25.toISOString())
  })

  test("no day means the memory never expires", () => {
    expect(momentOf("")).toBeNull()
    expect(dayOf(null)).toBe("")
  })

  test.each([
    ["its first moment", new Date(2026, 10, 25, 0, 0, 0, 0), "2026-11-25"],
    ["its last moment", new Date(2026, 10, 25, 23, 59, 59, 999), "2026-11-25"],
    ["the next midnight", new Date(2026, 10, 26, 0, 0, 0, 0), "2026-11-26"],
    ["a day in another year", new Date(2027, 0, 3, 12, 0), "2027-01-03"],
  ])("a moment at %s reads as its own day", (_, moment, day) => {
    expect(dayOf(moment.toISOString())).toBe(day)
  })

  test("a day read back from its own moment is the same day", () => {
    expect(dayOf(momentOf("2026-03-29"))).toBe("2026-03-29")
    expect(dayOf(momentOf("2026-10-25"))).toBe("2026-10-25")
  })

  test("the calendar's date and the field's day are the same day", () => {
    expect(dayOfDate(dateOfDay("2026-11-25"))).toBe("2026-11-25")
    expect(dateOfDay("2026-11-25").getTime()).toBe(startOfNov25.getTime())
  })
})
