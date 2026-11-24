import type {
  BridgeStatus,
  ErrorCode,
  MemoryAnswer,
  Method,
  Params,
  Result,
} from "@/server/bridge/protocol.ts"

/** The key of the bridge's status in the page's cache. */
export const STATUS_KEY = ["status"] as const

/** A request Studio's server refused or could not finish, with its reason for the person. */
export class ApiError extends Error {
  /** `http`: the answer was not Studio's own, such as the guard's when sign-in is lost. */
  readonly code: ErrorCode | "http"
  readonly status: number

  constructor(status: number, code: ErrorCode | "http", message: string) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.code = code
  }
}

/** Reads or changes the memory file through Studio's server. */
export async function callMemory<M extends Method>(
  method: M,
  params: Params<M>
): Promise<Result<M>> {
  const response = await post("/api/memory", { method, params })
  const answer = (await jsonOf(response)) as MemoryAnswer<Result<M>>
  if (!answer.ok) {
    throw new ApiError(response.status, answer.error.code, answer.error.message)
  }
  return answer.result
}

export async function fetchStatus(): Promise<BridgeStatus> {
  const response = await fetch("/api/status", { cache: "no-store" })
  return (await jsonOf(response)) as BridgeStatus
}

/** Starts the bridge again once a problem is fixed. */
export async function retryStatus(): Promise<BridgeStatus> {
  const response = await post("/api/status", {})
  return (await jsonOf(response)) as BridgeStatus
}

// After these the bridge is no longer running as it was, or Studio's server cannot be reached.
const RECHECK: ReadonlySet<ApiError["code"]> = new Set([
  "http",
  "setup",
  "stopped",
  "lost",
  "timeout",
  "unconfirmed",
])

/** Whether, after this error, the page should ask again where the bridge is. */
export function needsStatusCheck(error: Error): boolean {
  // An error that is not an ApiError never got an answer from Studio's server.
  return !(error instanceof ApiError) || RECHECK.has(error.code)
}

/**
 * The JSON of an answer. Studio's guard answers in plain text, for example when the sign-in
 * cookie is gone, so that text becomes the error instead of a failure to parse it.
 */
async function jsonOf(response: Response): Promise<unknown> {
  const type = response.headers.get("content-type") ?? ""
  if (type.includes("application/json")) return response.json()
  throw new ApiError(response.status, "http", await response.text())
}

function post(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}
