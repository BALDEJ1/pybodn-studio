import {
  BridgeError,
  type BridgeErrorCode,
  CALL_TIMEOUT,
  ERASE_TIMEOUT,
} from "./client.ts"
import { getBridge } from "./instance.ts"
import { METHODS, WRITES, type MemoryRequest, type Method } from "./protocol.ts"

/** Runs one request on the bridge and checks the shape of its result. */
export async function callMemory(request: MemoryRequest): Promise<unknown> {
  const timeout =
    request.method === "erase_deleted" ? ERASE_TIMEOUT : CALL_TIMEOUT
  const result = await getBridge().call(request.method, request.params, timeout)
  return METHODS[request.method].result.parse(result)
}

export type Failure = {
  status: number
  body: { ok: false; error: { code: string; message: string } }
}

const STATUS: Record<BridgeErrorCode, number> = {
  invalid: 400,
  bad_request: 400,
  not_found: 404,
  duplicate_key: 409,
  conflict: 409,
  busy: 503,
  newer_file: 503,
  setup: 503,
  stopped: 503,
  lost: 502,
  timeout: 504,
  storage: 500,
  pybodn: 500,
  internal: 500,
}

const INTERNAL =
  "Studio hit an internal error. The details are in the terminal."
const UNCONFIRMED =
  "Could not confirm the change. Reload to see what the memory file holds now."

/**
 * The answer to the page for a failed request. The library's own messages pass through, since
 * they say what to fix. Anything unexpected stays in the terminal: it may hold a record's text.
 */
export function failureOf(error: unknown, method: Method): Failure {
  if (!(error instanceof BridgeError)) {
    console.error(error)
    return failure(500, "internal", INTERNAL)
  }
  const unanswered = error.code === "timeout" || error.code === "lost"
  if (unanswered && WRITES.has(method)) {
    return failure(STATUS[error.code], error.code, UNCONFIRMED)
  }
  const message = error.code === "internal" ? INTERNAL : error.message
  return failure(STATUS[error.code], error.code, message)
}

function failure(status: number, code: string, message: string): Failure {
  return { status, body: { ok: false, error: { code, message } } }
}
