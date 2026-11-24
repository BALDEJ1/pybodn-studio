import { describe, expect, test } from "vitest"

import { readPort } from "./config.ts"

describe("the port", () => {
  test("is 3000 when PORT is not set", () => {
    expect(readPort(undefined)).toBe(3000)
  })

  test("is taken from PORT", () => {
    expect(readPort("4123")).toBe(4123)
  })

  test.each(["", "abc", "0", "65536", "3000x", "30.5", "-1", " 3000"])(
    "%j is refused with a clear reason",
    (value) => {
      expect(() => readPort(value)).toThrow(
        "PORT must be a whole number from 1 to 65535"
      )
    }
  )
})
