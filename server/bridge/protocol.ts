/**
 * What Studio and the Python bridge say to each other, and what the page may ask for.
 *
 * The bridge's greeting and the envelope of its answers are checked here, and so is every request
 * from the page. The results inside the answers are not checked again: the bridge is Studio's own
 * code, and its greeting proves it speaks this protocol. Their schemas give the page its types.
 * The library checks the values of a request again, so these schemas check shapes and types only.
 *
 * This file holds no Node code, so the page may import its types.
 */
import { z } from "zod"

/** The protocol version that bridge/bridge.py speaks. */
export const PROTOCOL = 1

export const VIEWS = ["active", "archived", "expired"] as const
export type View = (typeof VIEWS)[number]

// The bridge's own reasons for not opening the file, from its greeting.
const REFUSALS = [
  "missing_env",
  "no_file",
  "no_pybodn",
  "old_pybodn",
  "newer_file",
  "open_failed",
] as const

/** Why the bridge is not running, for the setup screen. */
export type SetupCode =
  | (typeof REFUSALS)[number]
  | "no_runner" // uv, or the Python in PYBODN_PYTHON, is not there
  | "bridge_failed" // the bridge started and then broke

export type Problem = { code: SetupCode; message: string; path: string | null }

/** Where the bridge is, as the page sees it. `stopped`: Studio is shutting down. */
export type BridgeStatus =
  | { state: "starting" }
  | { state: "ready"; path: string; python: string; pybodn: string }
  | { state: "setup"; problem: Problem }
  | { state: "stopped" }

const versions = { protocol: z.literal(PROTOCOL), python: z.string() }

/** The bridge's first line: the file it opened, or why it could not. */
export const greetingSchema = z.object({
  hello: z.discriminatedUnion("ok", [
    z.object({
      ...versions,
      ok: z.literal(true),
      pybodn: z.string(),
      path: z.string(),
    }),
    z.object({
      ...versions,
      ok: z.literal(false),
      pybodn: z.string().nullable(),
      path: z.string().nullable(),
      error: z.object({ code: z.enum(REFUSALS), message: z.string() }),
    }),
  ]),
})

/** The codes of the errors the bridge answers with. */
const BRIDGE_ERRORS = [
  "invalid",
  "not_found",
  "duplicate_key",
  "conflict",
  "busy",
  "newer_file",
  "storage",
  "pybodn",
  "internal",
  "bad_request",
] as const

/**
 * Every code a request can fail with: the bridge's own, and those of Studio.
 * - `timeout`: sent, and no answer came in time;
 * - `lost`: sent, and the bridge stopped before it answered;
 * - `stopped`: never sent, because the bridge stopped first;
 * - `setup`: the bridge cannot open the file;
 * - `unconfirmed`: a change got no answer, so it may or may not have happened;
 * - `busy`, also: too many requests are waiting.
 */
export type ErrorCode =
  | (typeof BRIDGE_ERRORS)[number]
  | "timeout"
  | "lost"
  | "stopped"
  | "setup"
  | "unconfirmed"

export const answerSchema = z.discriminatedUnion("ok", [
  z.object({ id: z.number().int(), ok: z.literal(true), result: z.unknown() }),
  z.object({
    id: z.number().int().nullable(),
    ok: z.literal(false),
    error: z.object({
      type: z.string(),
      code: z.enum(BRIDGE_ERRORS),
      message: z.string(),
    }),
  }),
])

/** What Studio's server answers the page for one request. */
export type MemoryAnswer<T = unknown> =
  | { ok: true; result: T }
  | { ok: false; error: { code: ErrorCode; message: string } }

// Results ----------------------------------------------------------------------------------------

const status = z.enum(VIEWS)

export const recordSchema = z.object({
  id: z.string(),
  namespace: z.string(),
  content: z.string(),
  key: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  tags: z.array(z.string()),
  importance: z.number(),
  source: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  version: z.number().int(),
  expires_at: z.string().nullable(),
  archived_at: z.string().nullable(),
  status,
})
export type MemoryRecord = z.infer<typeof recordSchema>

/** A record as a list shows it: the start of its text only. */
export const rowSchema = z.object({
  id: z.string(),
  content: z.string(),
  cut: z.boolean(),
  key: z.string().nullable(),
  tags: z.array(z.string()),
  expires_at: z.string().nullable(),
  updated_at: z.string(),
  version: z.number().int(),
  status,
})
export type Row = z.infer<typeof rowSchema>

const overviewSchema = z.object({
  namespaces: z.array(
    z.object({
      name: z.string(),
      active: z.number().int(),
      archived: z.number().int(),
      expired: z.number().int(),
    })
  ),
  expired: z.number().int(),
})
export type Overview = z.infer<typeof overviewSchema>

// Methods ----------------------------------------------------------------------------------------

export type MethodSpec = {
  params: z.ZodType
  result: z.ZodType
  /** It changes the file: a lost answer means Studio cannot say whether it happened. */
  write?: true
  /** How long it may take, when that is longer than the usual time limit. */
  timeout?: number
}

const target = { namespace: z.string(), id: z.string() }
const changes = z
  .object({
    content: z.string(),
    tags: z.array(z.string()),
    importance: z.number(),
    source: z.string().nullable(),
    expires_at: z.string().nullable(),
    metadata: z.record(z.string(), z.unknown()),
  })
  .partial()
  .strict()

/** Each method of the bridge. A new method is one entry here and one function in bridge.py. */
export const METHODS = {
  overview: { params: z.object({}).strict(), result: overviewSchema },
  list: {
    params: z.object({ namespace: z.string(), view: z.enum(VIEWS) }).strict(),
    result: z.object({ rows: z.array(rowSchema), total: z.number().int() }),
  },
  search: {
    params: z.object({ namespace: z.string(), query: z.string() }).strict(),
    result: z.object({ views: z.record(status, z.array(rowSchema)) }),
  },
  get: { params: z.object(target).strict(), result: recordSchema },
  key_owner: {
    params: z.object({ namespace: z.string(), key: z.string() }).strict(),
    result: recordSchema.nullable(),
  },
  add: {
    params: z
      .object({
        namespace: z.string(),
        content: z.string(),
        key: z.string().optional(),
        tags: z.array(z.string()).optional(),
      })
      .strict(),
    result: recordSchema,
    write: true,
  },
  put: {
    params: z
      .object({
        namespace: z.string(),
        key: z.string(),
        content: z.string(),
        tags: z.array(z.string()).optional(),
      })
      .strict(),
    result: recordSchema,
    write: true,
  },
  update: {
    params: z
      .object({
        ...target,
        expected_version: z.number().int(),
        changes,
      })
      .strict(),
    result: recordSchema,
    write: true,
  },
  archive: {
    params: z.object(target).strict(),
    result: recordSchema,
    write: true,
  },
  restore: {
    params: z.object(target).strict(),
    result: recordSchema,
    write: true,
  },
  delete: {
    params: z.object(target).strict(),
    result: z.object({ deleted: z.literal(true) }),
    write: true,
  },
  purge_expired: {
    params: z.object({}).strict(),
    result: z.object({ purged: z.number().int() }),
    write: true,
  },
  erase_deleted: {
    params: z.object({}).strict(),
    result: z.object({}),
    write: true,
    timeout: 15 * 60_000, // erasing rewrites the whole file
  },
} as const satisfies Record<string, MethodSpec>

export type Method = keyof typeof METHODS
export type Params<M extends Method> = z.infer<(typeof METHODS)[M]["params"]>
export type Result<M extends Method> = z.infer<(typeof METHODS)[M]["result"]>
