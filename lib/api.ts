import type { BridgeStatus } from "@/server/bridge/client.ts"
import type { Method, Params, Result } from "@/server/bridge/protocol.ts"

/** A request Studio's server refused or could not finish, with its reason for the person. */
export class ApiError extends Error {
  readonly code: string
  readonly status: number

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.code = code
  }
}

type Answer<T> =
  | { ok: true; result: T }
  | { ok: false; error: { code: string; message: string } }

/** Reads or changes the memory file through Studio's server. */
export async function callMemory<M extends Method>(
  method: M,
  params: Params<M>
): Promise<Result<M>> {
  const response = await post("/api/memory", { method, params })
  const answer = (await jsonOf(response)) as Answer<Result<M>>
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
