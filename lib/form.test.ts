import { describe, expect, test } from "vitest"

import type { MemoryRecord } from "@/server/bridge/protocol.ts"

import { momentOf } from "./expiry"
import {
  afterSave,
  changedElsewhere,
  changesOf,
  edit,
  fieldOf,
  formOf,
  formWith,
  problemsOf,
  rebase,
  type Draft,
  type Form,
} from "./form"

const record: MemoryRecord = {
  id: "3f9a1c0742be4d18a6c5e2b7d9014f63",
  namespace: "user:alice",
  content: "Prefers short answers",
  key: "answer-style",
  metadata: { channel: "web" },
  tags: ["style"],
  importance: 0.8,
  source: null,
  created_at: "2026-11-04T10:00:00+00:00",
  updated_at: "2026-11-20T10:00:00+00:00",
  version: 3,
  expires_at: null,
  archived_at: null,
  status: "active",
}

/** The same memory after someone saved it: one version on. */
const after = (changes: Partial<MemoryRecord>): MemoryRecord => ({
  ...record,
  ...changes,
  version: record.version + 1,
})

/** A draft of edits that differ from `memory`. */
function drafted(memory: MemoryRecord, patch: Partial<Form>): Draft {
  const draft = edit(memory, undefined, patch)
  if (!draft) throw new Error("these edits change nothing")
  return draft
}

describe("the form of a memory", () => {
  test("shows no source and no expiry as empty fields, and metadata as JSON text", () => {
    const form = formOf(record)

    expect(form.source).toBe("")
    expect(form.expires).toBe("")
    expect(JSON.parse(form.metadata)).toEqual({ channel: "web" })
  })

  test("a draft's edits stand in for the saved values, the rest is the memory's", () => {
    const draft = edit(record, undefined, { content: "Short answers, please" })

    expect(formWith(record, draft)).toEqual({
      ...formOf(record),
      content: "Short answers, please",
    })
  })
})

describe("a draft", () => {
  test("remembers the version its first edit was made on", () => {
    const first = edit(record, undefined, { content: "A" })
    const later = edit(after({}), first, { source: "chat" })

    expect(first?.version).toBe(3)
    expect(later?.version).toBe(3)
  })

  test("an edit typed back to the saved value is no edit, and no draft is left", () => {
    const draft = edit(record, undefined, { content: "Prefers long answers" })

    expect(edit(record, draft, { content: record.content })).toBeUndefined()
  })

  test("tags in the saved order are no edit; another order is", () => {
    expect(edit(record, undefined, { tags: ["style"] })).toBeUndefined()
    expect(
      edit({ ...record, tags: ["a", "b"] }, undefined, { tags: ["b", "a"] })
    ).toBeDefined()
  })

  test("metadata is kept as typed, even while it reads as the saved object", () => {
    const saved = formOf(record).metadata
    const typed = [
      `${saved}\n`,
      saved.replace("\n", "\n\n"),
      '{"channel":"web"}',
    ]

    for (const metadata of typed) {
      expect(edit(record, undefined, { metadata })?.edits).toEqual({ metadata })
    }
  })

  test("is changed elsewhere once the memory has a version newer than its edits began on", () => {
    const draft = drafted(record, { content: "Short answers" })

    expect(changedElsewhere(draft, record)).toBe(false)
    expect(changedElsewhere(draft, after({}))).toBe(true)
    expect(changedElsewhere(undefined, after({}))).toBe(false)
  })

  test("kept over a newer version, moves onto it, and edits it already holds are done", () => {
    const draft = drafted(record, { content: "Short answers", source: "chat" })
    const newer = after({ source: "chat", tags: ["style", "tone"] })

    expect(rebase(draft, newer)).toEqual({
      version: 4,
      edits: { content: "Short answers" },
    })
  })
})

describe("after a save", () => {
  test("what was sent is done, though the memory now lays its metadata out another way", () => {
    const sent = drafted(record, { metadata: '{"channel":"email"}' })
    const saved = after({ metadata: { channel: "email" } })

    expect(afterSave(sent, sent, saved)).toBeUndefined()
  })

  test("edits typed while the save was on its way stay, on the saved version", () => {
    const sent = drafted(record, { content: "Short answers" })
    const typedMeanwhile = edit(record, sent, {
      content: "Short answers, please",
      source: "chat",
    })
    const saved = after({ content: "Short answers" })

    expect(afterSave(typedMeanwhile, sent, saved)).toEqual({
      version: 4,
      edits: { content: "Short answers, please", source: "chat" },
    })
  })

  test("edits dropped while the save was on its way stay dropped", () => {
    const sent = drafted(record, { content: "Short answers" })

    expect(
      afterSave(undefined, sent, after({ content: "Short answers" }))
    ).toBeUndefined()
  })
})

describe("what a save sends", () => {
  test("only the fields edited, each as the library takes it", () => {
    const draft = drafted(record, {
      source: "",
      expires: "2026-12-01",
      metadata: '{"channel": "email", "tries": 2}',
    })

    expect(changesOf(record, draft)).toEqual({
      expires_at: momentOf("2026-12-01"),
      metadata: { channel: "email", tries: 2 },
    })
  })

  test("an empty source or expiry clears it", () => {
    const set = {
      ...record,
      source: "chat",
      expires_at: "2026-12-01T00:00:00Z",
    }
    const draft = drafted(set, { source: "", expires: "" })

    expect(changesOf(set, draft)).toEqual({ source: null, expires_at: null })
  })

  test("the text goes as typed, spaces and all", () => {
    const draft = drafted(record, { content: "  Two\nlines  " })

    expect(changesOf(record, draft)).toEqual({ content: "  Two\nlines  " })
  })

  test("an edit the memory already has, saved elsewhere, is not sent again", () => {
    const draft = drafted(record, { content: "Same", importance: 0.2 })
    const elsewhere = after({ content: "Same" })

    expect(changesOf(elsewhere, draft)).toEqual({ importance: 0.2 })
  })
})

describe("what the library would refuse", () => {
  test("a memory with no text, or only spaces", () => {
    expect(problemsOf({ content: " \n " })).toEqual({
      content: "A memory cannot be empty.",
    })
  })

  test("metadata that is not a JSON object", () => {
    expect(Object.keys(problemsOf({ metadata: "[1]" }))).toEqual(["metadata"])
  })

  test("only edits are judged: what the memory holds already, the library took", () => {
    const spaces = { ...record, content: "   " }
    const draft = edit(spaces, undefined, { importance: 0.1 })

    expect(problemsOf(draft?.edits ?? {})).toEqual({})
  })

  test.each([
    ["content must not be empty", "content"],
    ["tag must not contain a NUL character", "tags"],
    ["tags must be a list of strings", "tags"],
    ["importance must be a number from 0 to 1", "importance"],
    ["source must not contain lone surrogates", "source"],
    ["metadata must not be nested more than 100 levels deep", "metadata"],
    [
      "expires_at must be a datetime with a time zone, within years 1 to 9999 in UTC",
      "expires",
    ],
  ])("the library's %j belongs under the field %s", (message, field) => {
    expect(fieldOf(message)).toBe(field)
  })

  test("a reason that names no field belongs to none", () => {
    expect(fieldOf("update needs at least one field to change")).toBeNull()
  })
})
