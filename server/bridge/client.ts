/**
 * Runs the Python bridge and talks to it: one request at a time, each answer matched by its id.
 *
 * The bridge answers in order, so Studio keeps its own queue and sends the next request only
 * after the answer to the last one. A request's time limit therefore starts when it is sent, not
 * when it is queued, and a long request does not use up the time of those behind it.
 */
import {
  answerSchema,
  greetingSchema,
  type BridgeStatus,
  type ErrorCode,
  type SetupCode,
} from "./protocol.ts"

export const QUEUE_LIMIT = 32
export const LINE_LIMIT = 64 * 1024 * 1024 // bytes in one answer
export const START_TIMEOUT = 120_000 // the first start may install Python and pybodn
export const CALL_TIMEOUT = 30_000
const STOP_GRACE = 2_000 // time to close the engine after the input ends

const NEWLINE = 0x0a
const MB = 1024 * 1024
const MINUTE = 60_000

const SHUTTING_DOWN = "Studio is shutting down."

export class BridgeError extends Error {
  readonly code: ErrorCode

  constructor(code: ErrorCode, message: string) {
    super(message)
    this.name = "BridgeError"
    this.code = code
  }
}

/** The part of a child process the client uses, so that tests can stand in for Python. */
export interface BridgeProcess {
  readonly stdin: {
    write(data: string): unknown
    end(): unknown
    on(event: "error", listener: (error: Error) => void): unknown
  }
  readonly stdout: {
    on(event: "data", listener: (chunk: Buffer) => void): unknown
  }
  /** After the process ended and its output was read to the end, unlike "exit". */
  on(event: "close", listener: () => void): unknown
  on(event: "error", listener: (error: NodeJS.ErrnoException) => void): unknown
  kill(): unknown
}

type Call = {
  id: number
  line: string
  timeout: number
  resolve: (result: unknown) => void
  reject: (error: BridgeError) => void
}

type Running = {
  process: BridgeProcess
  exited: Promise<void>
  chunks: Buffer[]
  buffered: number
}

/** The status the page sees, or idle: not running until something asks for it. */
type State = BridgeStatus | { state: "idle" }

const IDLE = { state: "idle" } as const
const STARTING = { state: "starting" } as const
const STOPPED = { state: "stopped" } as const

export type ClientOptions = {
  spawn: () => BridgeProcess
  /** What the command needs installed, named when it is missing. */
  runner: "uv" | "python"
}

export class BridgeClient {
  readonly #spawn: () => BridgeProcess
  readonly #runner: "uv" | "python"
  #state: State = IDLE
  #running: Running | null = null
  #startTimer: NodeJS.Timeout | undefined
  #queue: Call[] = []
  #current: Call | null = null
  #callTimer: NodeJS.Timeout | undefined
  #nextId = 1

  constructor(options: ClientOptions) {
    this.#spawn = options.spawn
    this.#runner = options.runner
  }

  /** Where the bridge is. Asking starts it if it is not running. */
  status(): BridgeStatus {
    return this.#state.state === "idle" ? this.#start() : this.#state
  }

  /** Starts the bridge again after a problem, such as a file that was missing and is there now. */
  retry(): BridgeStatus {
    return this.#state.state === "setup" ? this.#start() : this.status()
  }

  /** Sends one request and resolves with its result, or rejects with a `BridgeError`. */
  call(
    method: string,
    params: unknown,
    timeout = CALL_TIMEOUT
  ): Promise<unknown> {
    const status = this.status()
    if (status.state === "setup") {
      return Promise.reject(new BridgeError("setup", status.problem.message))
    }
    if (status.state === "stopped") {
      return Promise.reject(new BridgeError("stopped", SHUTTING_DOWN))
    }
    if (this.#queue.length + (this.#current ? 1 : 0) >= QUEUE_LIMIT) {
      return Promise.reject(
        new BridgeError(
          "busy",
          "Too many requests are waiting. Try again in a moment."
        )
      )
    }
    return new Promise((resolve, reject) => {
      const id = this.#nextId++
      const line = `${JSON.stringify({ id, method, params })}\n`
      this.#queue.push({ id, line, timeout, resolve, reject })
      this.#pump()
    })
  }

  /**
   * Ends the bridge's input so that it closes the engine, then stops it. For shutting down:
   * nothing starts the bridge again afterwards.
   */
  async stop(): Promise<void> {
    const running = this.#running
    this.#end(
      STOPPED,
      new BridgeError("lost", SHUTTING_DOWN),
      new BridgeError("stopped", SHUTTING_DOWN),
      false
    )
    if (!running) return
    running.process.stdin.end()
    await Promise.race([running.exited, delay(STOP_GRACE)])
    running.process.kill()
  }

  /** Stops the bridge at once. For the moment Node exits, when nothing can wait. */
  kill(): void {
    this.#running?.process.kill()
  }

  #start(): BridgeStatus {
    let child: BridgeProcess
    try {
      child = this.#spawn()
    } catch (error) {
      return this.#setup("bridge_failed", messageOf(error))
    }
    const running: Running = {
      process: child,
      exited: new Promise((resolve) => child.on("close", () => resolve())),
      chunks: [],
      buffered: 0,
    }
    this.#running = running
    this.#state = STARTING
    this.#startTimer = setTimeout(() => {
      if (running === this.#running) {
        this.#setup(
          "bridge_failed",
          `Studio's Python side did not start within ${START_TIMEOUT / MINUTE} minutes.`
        )
      }
    }, START_TIMEOUT)
    // A write to a bridge that has just ended fails here; its exit says what happened.
    child.stdin.on("error", () => {})
    child.stdout.on("data", (chunk) => this.#onData(running, chunk))
    child.on("error", (error) => this.#onError(running, error))
    // "close", not "exit": a bridge that refuses the file prints why and ends at once, and its
    // last line may still be on the way when "exit" comes.
    child.on("close", () => this.#onExit(running))
    return STARTING
  }

  #onData(running: Running, chunk: Buffer): void {
    let start = 0
    for (
      let end = chunk.indexOf(NEWLINE);
      end !== -1 && running === this.#running;
      end = chunk.indexOf(NEWLINE, start)
    ) {
      const piece = chunk.subarray(start, end)
      if (this.#tooLong(running, piece.length)) return
      const line = Buffer.concat([...running.chunks, piece]).toString("utf8")
      running.chunks = []
      running.buffered = 0
      start = end + 1
      this.#onLine(line)
    }
    if (running !== this.#running || start === chunk.length) return
    const rest = chunk.subarray(start)
    if (this.#tooLong(running, rest.length)) return
    running.chunks.push(rest)
    running.buffered += rest.length
  }

  #tooLong(running: Running, more: number): boolean {
    if (running.buffered + more <= LINE_LIMIT) return false
    this.#broken(
      `An answer from the memory file was larger than ${LINE_LIMIT / MB} MB.`
    )
    return true
  }

  #onLine(line: string): void {
    if (!line.trim()) return
    let message: unknown
    try {
      message = JSON.parse(line)
    } catch {
      this.#broken("Studio's Python side sent a line that is not JSON.")
      return
    }
    if (this.#state.state === "starting") {
      this.#onGreeting(message)
      return
    }
    const answer = answerSchema.safeParse(message)
    if (!answer.success) {
      this.#broken("Studio's Python side sent an answer Studio cannot read.")
      return
    }
    const current = this.#current
    // An answer to a request that already ran out of time, or to none: nobody waits for it.
    if (!current || answer.data.id !== current.id) return
    clearTimeout(this.#callTimer)
    this.#current = null
    if (answer.data.ok) {
      current.resolve(answer.data.result)
    } else {
      const { code, message: text } = answer.data.error
      current.reject(new BridgeError(code, text))
    }
    this.#pump()
  }

  #onGreeting(message: unknown): void {
    clearTimeout(this.#startTimer)
    const parsed = greetingSchema.safeParse(message)
    if (!parsed.success) {
      this.#setup(
        "bridge_failed",
        "Studio and its Python side do not match. Use both from the same copy of Studio."
      )
      return
    }
    const hello = parsed.data.hello
    if (!hello.ok) {
      this.#setup(hello.error.code, hello.error.message, hello.path)
      return
    }
    this.#state = {
      state: "ready",
      path: hello.path,
      python: hello.python,
      pybodn: hello.pybodn,
    }
    this.#pump()
  }

  #onError(running: Running, error: NodeJS.ErrnoException): void {
    if (running !== this.#running) return
    if (error.code === "ENOENT") {
      const missing =
        this.#runner === "uv"
          ? "uv is not installed, or it is not on PATH."
          : "There is no Python at the path in PYBODN_PYTHON."
      this.#setup("no_runner", missing)
    } else {
      this.#setup("bridge_failed", error.message)
    }
  }

  #onExit(running: Running): void {
    if (running !== this.#running) return
    if (this.#state.state === "starting") {
      this.#setup(
        "bridge_failed",
        "Studio's Python side stopped before it started. Its messages are in the terminal."
      )
      return
    }
    this.#end(
      IDLE,
      new BridgeError(
        "lost",
        "Studio's Python side stopped before it answered."
      ),
      new BridgeError("stopped", "Studio's Python side stopped. Try again."),
      false
    )
  }

  /** The bridge broke the protocol: stop it. Before its greeting that is a setup problem. */
  #broken(reason: string): void {
    if (this.#state.state === "starting") {
      this.#setup("bridge_failed", reason)
      return
    }
    this.#end(
      IDLE,
      new BridgeError("lost", reason),
      new BridgeError("stopped", reason),
      true
    )
  }

  #setup(code: SetupCode, message: string, path: string | null = null) {
    const setup = { state: "setup", problem: { code, message, path } } as const
    const refused = new BridgeError("setup", message)
    this.#end(setup, refused, refused, true)
    return setup
  }

  /** Leaves the running bridge behind and fails every request still waiting. */
  #end(
    next: State,
    current: BridgeError,
    queued: BridgeError,
    kill: boolean
  ): void {
    const running = this.#running
    this.#running = null
    this.#state = next
    clearTimeout(this.#startTimer)
    clearTimeout(this.#callTimer)
    if (kill) running?.process.kill()
    const waiting = this.#queue
    this.#queue = []
    this.#current?.reject(current)
    this.#current = null
    for (const call of waiting) call.reject(queued)
  }

  #pump(): void {
    if (this.#state.state !== "ready" || this.#current || !this.#running) return
    const next = this.#queue.shift()
    if (!next) return
    this.#current = next
    this.#running.process.stdin.write(next.line)
    this.#callTimer = setTimeout(() => {
      if (this.#current !== next) return
      this.#end(
        IDLE,
        new BridgeError("timeout", "The memory file did not answer in time."),
        new BridgeError(
          "stopped",
          "Studio restarted its Python side. Try again."
        ),
        true
      )
    }, next.timeout)
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms).unref())
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
