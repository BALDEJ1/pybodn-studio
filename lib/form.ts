import type { MemoryRecord, Params } from "@/server/bridge/protocol.ts"

import { dayOf, momentOf } from "./expiry"
import { metadataText, readMetadata } from "./metadata"

/** The fields of the editor, as the person sees and types them. */
export type Form = {
  content: string
  tags: readonly string[]
  importance: number
  /** Empty for none. */
  source: string
  /** The first day the memory counts as expired, such as "2026-11-25"; empty for never. */
  expires: string
  /** JSON text of an object. */
  metadata: string
}

export type Field = keyof Form

/** The fields in the order the editor shows them. */
export const FIELDS = [
  "content",
  "tags",
  "importance",
  "source",
  "expires",
  "metadata",
] as const satisfies readonly Field[]

/**
 * The unsaved edits of one memory, and the version of it they were made on. Only fields that
 * differ from the memory are kept, so a draft always has something to save.
 */
export type Draft = { version: number; edits: Partial<Form> }

export type Changes = Params<"update">["changes"]

export function formOf(record: MemoryRecord): Form {
  return {
    content: record.content,
    tags: record.tags,
    importance: record.importance,
    source: record.source ?? "",
    expires: dayOf(record.expires_at),
    metadata: metadataText(record.metadata),
  }
}

/** The memory as the editor shows it: the draft's edits over what is saved. */
export function formWith(record: MemoryRecord, draft?: Draft): Form {
  return { ...formOf(record), ...draft?.edits }
}

/** The draft after `patch`. A draft starts on the version on screen and keeps it until saved. */
export function edit(
  record: MemoryRecord,
  draft: Draft | undefined,
  patch: Partial<Form>
): Draft | undefined {
  return draftOf(draft?.version ?? record.version, record, {
    ...draft?.edits,
    ...patch,
  })
}

/**
 * The draft on top of `record`, a newer version of the memory: after the person's own change, or
 * when they keep their edits over someone else's. Edits that `record` already holds are done.
 */
export function rebase(
  draft: Draft | undefined,
  record: MemoryRecord
): Draft | undefined {
  return draft && draftOf(record.version, record, draft.edits)
}

/** What saving the draft sends: only the fields that differ, each as the library takes it. */
export function changesOf(record: MemoryRecord, draft: Draft): Changes {
  const edits = differing(record, draft.edits)
  return {
    ...(edits.content !== undefined && { content: edits.content }),
    ...(edits.tags !== undefined && { tags: [...edits.tags] }),
    ...(edits.importance !== undefined && { importance: edits.importance }),
    ...(edits.source !== undefined && { source: edits.source || null }),
    ...(edits.expires !== undefined && { expires_at: momentOf(edits.expires) }),
    ...(edits.metadata !== undefined && {
      metadata: metadataOf(edits.metadata),
    }),
  }
}

const EMPTY = "A memory cannot be empty."

/**
 * Why the library would refuse these edits, field by field. Only edits are judged: what a memory
 * holds already, the library took.
 */
export function problemsOf(
  edits: Partial<Form>
): Partial<Record<Field, string>> {
  const metadata =
    edits.metadata === undefined ? null : readMetadata(edits.metadata)
  return {
    ...(edits.content?.trim() === "" && { content: EMPTY }),
    ...(metadata?.ok === false && { metadata: metadata.message }),
  }
}

// The library starts each of its reasons with the name of the field it refused.
const NAMED: Readonly<Record<string, Field>> = {
  content: "content",
  tag: "tags",
  tags: "tags",
  importance: "importance",
  source: "source",
  expires_at: "expires",
  metadata: "metadata",
}

/** The field a reason of the library is about, to show it under that field. */
export function fieldOf(message: string): Field | null {
  const name = message.split(" ", 1)[0]
  return Object.hasOwn(NAMED, name) ? NAMED[name] : null
}

function draftOf(
  version: number,
  record: MemoryRecord,
  edits: Partial<Form>
): Draft | undefined {
  const kept = differing(record, edits)
  return Object.keys(kept).length === 0 ? undefined : { version, edits: kept }
}

function differing(record: MemoryRecord, edits: Partial<Form>): Partial<Form> {
  const saved = formOf(record)
  return Object.fromEntries(
    FIELDS.filter(
      (field) =>
        edits[field] !== undefined && !same(field, edits[field], saved[field])
    ).map((field) => [field, edits[field]])
  )
}

function same(field: Field, a: Form[Field], b: Form[Field]): boolean {
  // The same object laid out another way is the same metadata; key order still counts.
  if (field === "metadata") return canonical(String(a)) === canonical(String(b))
  if (Array.isArray(a) && Array.isArray(b)) {
    return (
      a.length === b.length && a.every((value, index) => value === b[index])
    )
  }
  return a === b
}

function canonical(metadata: string): string {
  const read = readMetadata(metadata)
  return read.ok ? JSON.stringify(read.value) : metadata
}

function metadataOf(text: string): Record<string, unknown> {
  const read = readMetadata(text)
  if (!read.ok)
    throw new Error(`metadata to save is not valid: ${read.message}`)
  return read.value
}
