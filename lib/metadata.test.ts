import { describe, expect, test } from "vitest"

import { metadataText, readMetadata } from "./metadata"

const TOO_LARGE =
  "A whole number this large would lose digits. Put it in quotes to keep it as text."

describe("metadata typed as JSON", () => {
  test("an object is taken as it is", () => {
    const read = readMetadata('{"channel": "web", "tries": [1, 2]}')

    expect(read).toEqual({
      ok: true,
      value: { channel: "web", tries: [1, 2] },
    })
  })

  test("an empty object is fine: the memory then has no metadata", () => {
    expect(readMetadata("{}")).toEqual({ ok: true, value: {} })
  })

  test("text that is not JSON says why, in the parser's words", () => {
    const read = readMetadata('{"channel": web}')

    expect(read.ok).toBe(false)
    if (!read.ok) expect(read.message).toMatch(/^Not valid JSON: /)
  })

  test.each([
    ["a list", "[1, 2]"],
    ["a string", '"web"'],
    ["a number", "4"],
    ["null", "null"],
  ])(
    "JSON that is %s is refused: the library takes an object only",
    (_, text) => {
      expect(readMetadata(text)).toEqual({
        ok: false,
        message: "Metadata must be a JSON object, in curly braces.",
      })
    }
  )

  test.each([
    ["at the top", '{"order": 1734567890123456789}'],
    ["deep inside", '{"orders": [{"id": -1734567890123456789}]}'],
  ])(
    "a whole number too large to keep every digit is refused %s",
    (_, text) => {
      expect(readMetadata(text)).toEqual({
        ok: false,
        message: TOO_LARGE,
      })
    }
  )

  test("whole numbers up to the largest exact one, and fractions, are taken", () => {
    const text = '{"max": 9007199254740991, "min": -42, "share": 0.5}'

    expect(readMetadata(text)).toEqual({
      ok: true,
      value: { max: 9007199254740991, min: -42, share: 0.5 },
    })
  })

  test("a __proto__ key stays an ordinary key, and nothing else changes", () => {
    const text = '{"__proto__": {"admin": true}, "plan": "free"}'

    const read = readMetadata(text)

    expect(read.ok).toBe(true)
    if (!read.ok) return
    expect(Object.keys(read.value)).toEqual(["__proto__", "plan"])
    expect(Object.getPrototypeOf(read.value)).toBe(Object.prototype)
    expect(({} as Record<string, unknown>).admin).toBeUndefined()
    // Written back, it is the same text the person typed, so a save keeps the key.
    expect(JSON.parse(metadataText(read.value))).toEqual(JSON.parse(text))
    expect(metadataText(read.value)).toContain('"__proto__"')
  })
})
