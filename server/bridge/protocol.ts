/**
 * What Studio and the Python bridge say to each other, and what the page may ask for.
 *
 * Every line from the bridge and every request from the page is checked here before it is used.
 * The library checks the values again, so these schemas check shapes and types only.
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
export const BRIDGE_ERRORS = [
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

// Requests ---------------------------------------------------------------------------------------

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

/** Each method of the bridge: its parameters and its result. */
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
  },
  archive: { params: z.object(target).strict(), result: recordSchema },
  restore: { params: z.object(target).strict(), result: recordSchema },
  delete: {
    params: z.object(target).strict(),
    result: z.object({ deleted: z.literal(true) }),
  },
  purge_expired: {
    params: z.object({}).strict(),
    result: z.object({ purged: z.number().int() }),
  },
  erase_deleted: {
    params: z.object({}).strict(),
    result: z.object({}),
  },
} as const

export type Method = keyof typeof METHODS
export type Params<M extends Method> = z.infer<(typeof METHODS)[M]["params"]>
export type Result<M extends Method> = z.infer<(typeof METHODS)[M]["result"]>

/** Methods that change the file: a lost answer means Studio cannot say whether they happened. */
export const WRITES: ReadonlySet<Method> = new Set<Method>([
  "add",
  "put",
  "update",
  "archive",
  "restore",
  "delete",
  "purge_expired",
  "erase_deleted",
])

function requestOf<M extends Method>(method: M) {
  return z
    .object({ method: z.literal(method), params: METHODS[method].params })
    .strict()
}

/** A request from the page: one method of the bridge with its parameters. */
export const memoryRequestSchema = z.discriminatedUnion("method", [
  requestOf("overview"),
  requestOf("list"),
  requestOf("search"),
  requestOf("get"),
  requestOf("key_owner"),
  requestOf("add"),
  requestOf("put"),
  requestOf("update"),
  requestOf("archive"),
  requestOf("restore"),
  requestOf("delete"),
  requestOf("purge_expired"),
  requestOf("erase_deleted"),
])
export type MemoryRequest = z.infer<typeof memoryRequestSchema>
