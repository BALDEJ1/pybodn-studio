import { beforeEach, describe, expect, test, vi } from "vitest"

import { BridgeError } from "./client.ts"
import { runRequest } from "./memory.ts"

const bridge = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock("./instance.ts", () => ({ getBridge: () => bridge }))

beforeEach(() => {
  bridge.call.mockReset()
})

const target = { namespace: "a", id: "x" }

describe("the answer to a failed request", () => {
  test.each(["timeout", "lost"] as const)(
    "a change that got no answer (%s) is reported as not confirmed",
    async (code) => {
      bridge.call.mockRejectedValue(new BridgeError(code, "no answer"))

      const write = await runRequest({ method: "delete", params: target })
      const read = await runRequest({ method: "get", params: target })

      expect(write.body).toMatchObject({
        ok: false,
        error: { code: "unconfirmed" },
      })
      expect(read.body).toEqual({
        ok: false,
        error: { code, message: "no answer" },
      })
    }
  )

  test("the library's reason reaches the page, with the status the page acts on", async () => {
    bridge.call
      .mockRejectedValueOnce(new BridgeError("invalid", "tags must be text"))
      .mockRejectedValueOnce(new BridgeError("conflict", "version 3"))

    const invalid = await runRequest({ method: "archive", params: target })
    const conflict = await runRequest({ method: "restore", params: target })

    expect(invalid).toEqual({
      status: 400,
      body: {
        ok: false,
        error: { code: "invalid", message: "tags must be text" },
      },
    })
    expect([conflict.status, conflict.body]).toMatchObject([
      409,
      { error: { code: "conflict" } },
    ])
  })

  test("the details of an unexpected error stay in the terminal", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    bridge.call.mockRejectedValue(new TypeError("Prefers short answers"))

    const reply = await runRequest({ method: "get", params: target })

    expect(reply.status).toBe(500)
    expect(JSON.stringify(reply.body)).not.toContain("Prefers short answers")
    expect(log).toHaveBeenCalled()
    log.mockRestore()
  })
})

describe("a request from the page", () => {
  test.each([
    ["a body that is not an object", undefined],
    ["an unknown method", { method: "drop", params: {} }],
    [
      "a change of the key, which never changes",
      {
        method: "update",
        params: { ...target, expected_version: 1, changes: { key: "k" } },
      },
    ],
    [
      "a change without the version it was made on",
      { method: "update", params: { ...target, changes: { content: "c" } } },
    ],
    [
      "metadata that is not an object",
      {
        method: "update",
        params: { ...target, expected_version: 1, changes: { metadata: [1] } },
      },
    ],
    [
      "a view that does not exist",
      { method: "list", params: { namespace: "a", view: "deleted" } },
    ],
    [
      "a field the method does not take",
      { method: "delete", params: { ...target, all: true } },
    ],
  ])("is refused for %s, and never reaches the file", async (_, request) => {
    const reply = await runRequest(request)

    expect(reply.status).toBe(400)
    expect(reply.body).toMatchObject({
      ok: false,
      error: { code: "bad_request" },
    })
    expect(bridge.call).not.toHaveBeenCalled()
  })

  test("a change with its version reaches the bridge", async () => {
    bridge.call.mockResolvedValue({ version: 4 })
    const params = {
      ...target,
      expected_version: 3,
      changes: { tags: ["food"] },
    }

    const reply = await runRequest({ method: "update", params })

    expect(reply).toEqual({
      status: 200,
      body: { ok: true, result: { version: 4 } },
    })
    expect(bridge.call).toHaveBeenCalledWith("update", params, undefined)
  })

  test("metadata with a __proto__ key reaches the bridge as typed, and changes nothing else", async () => {
    bridge.call.mockResolvedValue({ version: 4 })
    // As the server reads it from the request's body.
    const body: unknown = JSON.parse(
      JSON.stringify({
        method: "update",
        params: { ...target, expected_version: 3, changes: {} },
      }).replace(
        '"changes":{}',
        '"changes":{"metadata":{"__proto__":{"admin":true},"plan":"free"}}'
      )
    )

    await runRequest(body)

    const sent = bridge.call.mock.calls[0][1] as {
      changes: { metadata: Record<string, unknown> }
    }
    expect(JSON.stringify(sent.changes.metadata)).toBe(
      '{"__proto__":{"admin":true},"plan":"free"}'
    )
    expect(Object.getPrototypeOf(sent.changes.metadata)).toBe(Object.prototype)
    expect(({} as Record<string, unknown>).admin).toBeUndefined()
  })

  test("erasing may take 15 minutes; the rest keep the usual limit", async () => {
    bridge.call.mockResolvedValue({})

    await runRequest({ method: "erase_deleted", params: {} })
    await runRequest({ method: "overview", params: {} })

    // No limit given means the client's usual one.
    const limits = bridge.call.mock.calls.map((call) => call[2])
    expect(limits).toEqual([15 * 60_000, undefined])
  })
})
