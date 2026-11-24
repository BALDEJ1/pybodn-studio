import { describe, expect, test, vi } from "vitest"

import { BridgeError } from "./client.ts"
import { failureOf } from "./memory.ts"
import { memoryRequestSchema } from "./protocol.ts"

describe("the answer to a failed request", () => {
  test.each(["timeout", "lost"] as const)(
    "a change that got no answer (%s) is reported as not confirmed",
    (code) => {
      const write = failureOf(new BridgeError(code, "no answer"), "delete")
      const read = failureOf(new BridgeError(code, "no answer"), "get")

      expect(write.body.error.message).toMatch(/not confirm/i)
      expect(read.body.error.message).toBe("no answer")
    }
  )

  test("the library's reason reaches the page, with the status the page acts on", () => {
    const invalid = failureOf(
      new BridgeError("invalid", "tags must be text"),
      "update"
    )
    const conflict = failureOf(
      new BridgeError("conflict", "version 3"),
      "update"
    )

    expect([invalid.status, invalid.body.error.message]).toEqual([
      400,
      "tags must be text",
    ])
    expect([conflict.status, conflict.body.error.code]).toEqual([
      409,
      "conflict",
    ])
  })

  test("the details of an unexpected error stay in the terminal", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})

    const answer = failureOf(new TypeError("Prefers short answers"), "get")

    expect(answer.status).toBe(500)
    expect(JSON.stringify(answer.body)).not.toContain("Prefers short answers")
    expect(log).toHaveBeenCalled()
    log.mockRestore()
  })
})

describe("a request from the page", () => {
  test.each([
    ["an unknown method", { method: "drop", params: {} }],
    [
      "a change of the key, which never changes",
      {
        method: "update",
        params: {
          namespace: "a",
          id: "x",
          expected_version: 1,
          changes: { key: "k" },
        },
      },
    ],
    [
      "a change without the version it was made on",
      {
        method: "update",
        params: { namespace: "a", id: "x", changes: { content: "c" } },
      },
    ],
    [
      "a view that does not exist",
      { method: "list", params: { namespace: "a", view: "deleted" } },
    ],
    [
      "a field the method does not take",
      { method: "delete", params: { namespace: "a", id: "x", all: true } },
    ],
  ])("is refused for %s", (_, request) => {
    expect(memoryRequestSchema.safeParse(request).success).toBe(false)
  })

  test("a change with its version passes", () => {
    const request = {
      method: "update",
      params: {
        namespace: "a",
        id: "x",
        expected_version: 3,
        changes: { tags: ["food"] },
      },
    }

    expect(memoryRequestSchema.safeParse(request).success).toBe(true)
  })
})
