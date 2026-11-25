import type { MemoryRecord, Params } from "@/server/bridge/protocol.ts"

import { dayOf, momentOf } from "./expiry"
import { metadataText, readMetadata } from "./metadata"
import { fieldNamed } from "./reason"

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

/** Whether someone saved the memory after the draft's edits began. */
export function changedElsewhere(
  draft: Draft | undefined,
  record: MemoryRecord
): boolean {
  return draft !== undefined && record.version > draft.version
}

/**
 * The draft on top of `record`, a newer version of the memory, when the person keeps their edits
 * over someone else's. Edits that `record` already holds are done.
 */
export function rebase(
  draft: Draft | undefined,
  record: MemoryRecord
): Draft | undefined {
  return draft && draftOf(record.version, record, draft.edits)
}

/**
 * The draft once the page's own archive or restore made `changed`, one version on. Edits begun on
 * the version before move onto it. Edits someone else's save had already passed stay behind it,
 * so the person still picks whose edits stay.
 */
export function afterOwnChange(
  draft: Draft | undefined,
  changed: MemoryRecord
): Draft | undefined {
  if (!draft || draft.version < changed.version - 1) return draft
  return rebase(draft, changed)
}

/**
 * The draft once `sent` is saved as `saved`. What was typed while the save was on its way stays, on
 * the saved version; the rest is done, even where the memory now lays it out another way.
 */
export function afterSave(
  current: Draft | undefined,
  sent: Draft,
  saved: MemoryRecord
): Draft | undefined {
  if (!current) return undefined
  const typed = FIELDS.filter((field) => {
    const value = current.edits[field]
    const before = sent.edits[field]
    return value !== undefined && (before === undefined || !same(value, before))
  })
  return draftOf(
    saved.version,
    saved,
    Object.fromEntries(typed.map((field) => [field, current.edits[field]]))
  )
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
  return fieldNamed(message, NAMED)
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
      (field) => edits[field] !== undefined && !same(edits[field], saved[field])
    ).map((field) => [field, edits[field]])
  )
}

// Text is compared as typed: metadata that reads as the same object is still an edit, so no
// keystroke is ever taken back.
function same(a: Form[Field], b: Form[Field]): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return (
      a.length === b.length && a.every((value, index) => value === b[index])
    )
  }
  return a === b
}

function metadataOf(text: string): Record<string, unknown> {
  const read = readMetadata(text)
  if (!read.ok)
    throw new Error(`metadata to save is not valid: ${read.message}`)
  return read.value
}
