import { EventEmitter } from "node:events"

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

import {
  BridgeClient,
  type BridgeProcess,
  LINE_LIMIT,
  QUEUE_LIMIT,
} from "./client.ts"

const HELLO = {
  hello: {
    protocol: 1,
    python: "3.13.1",
    pybodn: "1.2.0",
    path: "/data/memory.db",
    ok: true,
  },
}

/** Stands in for the Python process: records what Studio writes, says what a test tells it. */
class FakeBridge extends EventEmitter implements BridgeProcess {
  readonly written: string[] = []
  ended = false
  killed = false
  readonly stdout = new EventEmitter()
  readonly stdin = Object.assign(new EventEmitter(), {
    write: (data: string) => this.written.push(data),
    end: () => {
      this.ended = true
    },
  })

  kill(): boolean {
    this.killed = true
    return true
  }

  say(message: unknown): void {
    this.stdout.emit("data", Buffer.from(`${JSON.stringify(message)}\n`))
  }

  ids(): number[] {
    return this.written.map((line) => (JSON.parse(line) as { id: number }).id)
  }

  answer(id: number, result: unknown = { done: id }): void {
    this.say({ id, ok: true, result })
  }
}

function start(runner: "uv" | "python" = "uv") {
  const spawned: FakeBridge[] = []
  const client = new BridgeClient({
    runner,
    spawn: () => {
      const bridge = new FakeBridge()
      spawned.push(bridge)
      return bridge
    },
  })
  return { client, spawned }
}

/** A client whose bridge has greeted, so requests go out at once. */
function ready() {
  const started = start()
  started.client.status()
  started.spawned[0].say(HELLO)
  return { ...started, bridge: started.spawned[0] }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("requests", () => {
  test("each answer goes to the request with its id, one request at a time", async () => {
    const { client, bridge } = ready()

    const first = client.call("get", { id: "a" })
    const second = client.call("get", { id: "b" })
    const sentBeforeAnswer = bridge.ids()
    bridge.answer(sentBeforeAnswer[0])

    await expect(first).resolves.toEqual({ done: sentBeforeAnswer[0] })
    expect(sentBeforeAnswer).toHaveLength(1)
    expect(bridge.ids()).toHaveLength(2)
    bridge.answer(bridge.ids()[1])
    await expect(second).resolves.toEqual({ done: bridge.ids()[1] })
  })

  test("requests sent before the greeting wait for it", async () => {
    const { client, spawned } = start()

    const pending = client.call("overview", {})
    const sentBeforeGreeting = spawned[0].written.length
    spawned[0].say(HELLO)
    spawned[0].answer(spawned[0].ids()[0])

    expect(sentBeforeGreeting).toBe(0)
    await expect(pending).resolves.toBeDefined()
  })

  test("an error from the library reaches the request with its code", async () => {
    const { client, bridge } = ready()

    const pending = client.call("update", {})
    bridge.say({
      id: bridge.ids()[0],
      ok: false,
      error: {
        type: "ConcurrentUpdateError",
        code: "conflict",
        message: "version 3",
      },
    })

    await expect(pending).rejects.toMatchObject({
      code: "conflict",
      message: "version 3",
    })
  })

  test("an answer to no waiting request is ignored", async () => {
    const { client, bridge } = ready()

    const pending = client.call("get", {})
    bridge.answer(999)
    bridge.answer(bridge.ids()[0])

    await expect(pending).resolves.toEqual({ done: bridge.ids()[0] })
  })

  test(`more than ${QUEUE_LIMIT} waiting requests are refused at once`, async () => {
    const { client, spawned } = start()
    const waiting = Array.from({ length: QUEUE_LIMIT }, () =>
      client.call("get", {})
    )

    const extra = client.call("get", {})

    await expect(extra).rejects.toMatchObject({ code: "busy" })
    expect(spawned).toHaveLength(1)
    waiting.forEach((call) => call.catch(() => {}))
  })
})

describe("time limits", () => {
  test("the limit starts when a request is sent, not when it is queued", async () => {
    const { client, bridge } = ready()
    const first = client.call("get", {}, 30_000)
    const second = client.call("get", {}, 30_000)

    await vi.advanceTimersByTimeAsync(25_000)
    bridge.answer(bridge.ids()[0])
    await vi.advanceTimersByTimeAsync(25_000)
    bridge.answer(bridge.ids()[1])

    await expect(first).resolves.toBeDefined()
    await expect(second).resolves.toBeDefined()
  })

  test("a request without an answer in time stops the bridge, and the next one starts another", async () => {
    const { client, spawned, bridge } = ready()
    const late = client.call("update", {}, 30_000)
    const queued = client.call("get", {}, 30_000)
    const caught = Promise.allSettled([late, queued])

    await vi.advanceTimersByTimeAsync(30_000)
    const [timedOut, neverSent] = await caught
    client.call("get", {}).catch(() => {})

    expect(timedOut).toMatchObject({ reason: { code: "timeout" } })
    expect(neverSent).toMatchObject({ reason: { code: "stopped" } })
    expect(bridge.killed).toBe(true)
    expect(spawned).toHaveLength(2)
  })

  test("an answer from a bridge that was stopped is ignored", async () => {
    const { client, spawned, bridge } = ready()
    client.call("get", {}, 1_000).catch(() => {})
    await vi.advanceTimersByTimeAsync(1_000)
    const next = client.call("get", {})
    spawned[1].say(HELLO)

    bridge.answer(spawned[1].ids()[0], "from the old bridge")
    spawned[1].answer(spawned[1].ids()[0], "from the new bridge")

    await expect(next).resolves.toBe("from the new bridge")
  })
})

describe("reading answers", () => {
  test("an answer split across reads, even inside a character, arrives whole", async () => {
    const { client, bridge } = ready()
    const pending = client.call("get", {})
    const text = "café ☕"
    const line = Buffer.from(
      `${JSON.stringify({ id: bridge.ids()[0], ok: true, result: text })}\n`
    )
    const insideCup = line.indexOf(Buffer.from("☕")) + 1

    bridge.stdout.emit("data", line.subarray(0, insideCup))
    bridge.stdout.emit("data", line.subarray(insideCup))

    await expect(pending).resolves.toBe(text)
  })
})

describe("a bridge that breaks", () => {
  test("stopping while it answers fails the request; the next one starts a new bridge", async () => {
    const { client, spawned, bridge } = ready()
    const pending = client.call("delete", {})

    bridge.emit("close")
    client.call("get", {}).catch(() => {})

    await expect(pending).rejects.toMatchObject({ code: "lost" })
    expect(spawned).toHaveLength(2)
  })

  test(`an answer over ${LINE_LIMIT / 1024 / 1024} MB stops it`, async () => {
    const { client, bridge } = ready()
    const pending = client.call("get", {})

    bridge.stdout.emit("data", Buffer.alloc(LINE_LIMIT, 0x61))
    bridge.stdout.emit("data", Buffer.from("a"))

    await expect(pending).rejects.toMatchObject({ code: "lost" })
    expect(bridge.killed).toBe(true)
  })

  test("a line that is not JSON stops it", async () => {
    const { client, bridge } = ready()
    const pending = client.call("get", {})

    bridge.stdout.emit(
      "data",
      Buffer.from("Traceback (most recent call last)\n")
    )

    await expect(pending).rejects.toMatchObject({ code: "lost" })
    expect(bridge.killed).toBe(true)
  })
})

describe("starting", () => {
  test("a refusal in the greeting is shown, and requests fail until a retry", async () => {
    const { client, spawned } = start()
    client.status()

    spawned[0].say({
      hello: {
        protocol: 1,
        python: "3.13.1",
        pybodn: "1.2.0",
        path: "/data/typo.db",
        ok: false,
        error: {
          code: "no_file",
          message: "there is no memory file at /data/typo.db",
        },
      },
    })

    expect(client.status()).toEqual({
      state: "setup",
      problem: {
        code: "no_file",
        message: "there is no memory file at /data/typo.db",
        path: "/data/typo.db",
      },
    })
    await expect(client.call("overview", {})).rejects.toMatchObject({
      code: "setup",
    })
    expect(spawned).toHaveLength(1)
    expect(client.retry()).toEqual({ state: "starting" })
    expect(spawned).toHaveLength(2)
  })

  test.each([
    ["uv", "uv is not installed"],
    ["python", "PYBODN_PYTHON"],
  ] as const)("a missing %s is a setup problem", (runner, named) => {
    const { client, spawned } = start(runner)
    client.status()

    spawned[0].emit(
      "error",
      Object.assign(new Error("spawn"), { code: "ENOENT" })
    )

    const status = client.status()
    expect(status).toMatchObject({
      state: "setup",
      problem: { code: "no_runner" },
    })
    expect(status.state === "setup" && status.problem.message).toContain(named)
  })

  test("a bridge that ends before its greeting is a setup problem", () => {
    const { client, spawned } = start()
    client.status()

    spawned[0].emit("close")

    expect(client.status()).toMatchObject({
      state: "setup",
      problem: { code: "bridge_failed" },
    })
  })

  test("a greeting of another protocol version is a setup problem", () => {
    const { client, spawned } = start()
    client.status()

    spawned[0].say({ hello: { ...HELLO.hello, protocol: 2 } })

    expect(client.status()).toMatchObject({ state: "setup" })
    expect(spawned[0].killed).toBe(true)
  })

  test("the first start may take up to 2 minutes", async () => {
    const { client } = start()
    client.status()

    await vi.advanceTimersByTimeAsync(119_000)
    const before = client.status().state
    await vi.advanceTimersByTimeAsync(1_000)

    expect(before).toBe("starting")
    expect(client.status()).toMatchObject({
      state: "setup",
      problem: { code: "bridge_failed" },
    })
  })
})

describe("stopping", () => {
  test("ends the bridge's input so it can close the file, then stops it", async () => {
    const { client, bridge } = ready()

    const stopping = client.stop()
    const endedFirst = bridge.ended && !bridge.killed
    await vi.advanceTimersByTimeAsync(2_000)
    await stopping

    expect(endedFirst).toBe(true)
    expect(bridge.killed).toBe(true)
  })

  test("after stopping, nothing starts the bridge again", async () => {
    const { client, spawned } = ready()
    const stopping = client.stop()
    await vi.advanceTimersByTimeAsync(2_000)
    await stopping

    const late = client.call("get", {})

    await expect(late).rejects.toMatchObject({ code: "stopped" })
    expect(client.status()).toEqual({ state: "stopped" })
    expect(client.retry()).toEqual({ state: "stopped" })
    expect(spawned).toHaveLength(1)
  })
})
