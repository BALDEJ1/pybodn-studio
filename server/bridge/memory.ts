import { z } from "zod"

import { BridgeError } from "./client.ts"
import { getBridge } from "./instance.ts"
import {
  METHODS,
  type ErrorCode,
  type MemoryAnswer,
  type Method,
  type MethodSpec,
} from "./protocol.ts"

export type Reply = { status: number; body: MemoryAnswer }

const NAMES = Object.keys(METHODS) as [Method, ...Method[]]
const requestSchema = z
  .object({ method: z.enum(NAMES), params: z.unknown() })
  .strict()

/** Checks one request from the page, runs it on the bridge, and says what happened. */
export async function runRequest(body: unknown): Promise<Reply> {
  const request = requestSchema.safeParse(body)
  if (!request.success) return refused(request.error)
  const { method } = request.data
  const spec: MethodSpec = METHODS[method]
  const params = spec.params.safeParse(request.data.params)
  if (!params.success) return refused(params.error)
  try {
    const result = await getBridge().call(method, params.data, spec.timeout)
    return { status: 200, body: { ok: true, result } }
  } catch (error) {
    return failureOf(error, spec)
  }
}

const STATUS: Record<ErrorCode, number> = {
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
  unconfirmed: 502,
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
 * The answer for a failed request. The library's own messages pass through, since they say what
 * to fix. Anything unexpected stays in the terminal: it may hold a record's text.
 */
function failureOf(error: unknown, spec: MethodSpec): Reply {
  if (!(error instanceof BridgeError)) {
    console.error(error)
    return failure("internal", INTERNAL)
  }
  const unanswered = error.code === "timeout" || error.code === "lost"
  if (unanswered && spec.write) return failure("unconfirmed", UNCONFIRMED)
  return failure(
    error.code,
    error.code === "internal" ? INTERNAL : error.message
  )
}

function refused(error: z.ZodError): Reply {
  const issue = error.issues[0]
  return failure(
    "bad_request",
    `${issue.path.join(".") || "request"}: ${issue.message}`
  )
}

function failure(code: ErrorCode, message: string): Reply {
  return { status: STATUS[code], body: { ok: false, error: { code, message } } }
}
