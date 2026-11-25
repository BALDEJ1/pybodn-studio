import { describe, expect, test } from "vitest"

import type { MemoryRecord } from "@/server/bridge/protocol.ts"

import {
  isReady,
  keyToCheck,
  newFieldOf,
  outcomeOf,
  requestOf,
  type NewMemory,
} from "./new-memory"

const NAMESPACES = ["user:alice", "user:bob"]

const typed: NewMemory = {
  namespace: "user:alice",
  content: "Prefers tea to coffee",
  tags: ["food"],
  key: "",
}

const owner: MemoryRecord = {
  id: "3f9a1c0742be4d18a6c5e2b7d9014f63",
  namespace: "user:alice",
  content: "Planning a trip to Lisbon in October",
  key: "next-trip",
  metadata: {},
  tags: ["travel"],
  importance: 0.4,
  source: "chat",
  created_at: "2026-11-04T10:00:00+00:00",
  updated_at: "2026-11-20T10:00:00+00:00",
  version: 2,
  expires_at: null,
  archived_at: "2026-11-20T10:00:00+00:00",
  status: "archived",
}

describe("a new memory", () => {
  test.each([
    ["no namespace", { namespace: "  " }],
    ["no text", { content: "\n " }],
  ])("cannot be added with %s", (_, patch) => {
    expect(isReady({ ...typed, ...patch })).toBe(false)
  })

  test("can be added with a namespace and text, the rest being optional", () => {
    expect(isReady({ ...typed, tags: [], key: "" })).toBe(true)
  })

  test("in a namespace the file has is added to it; in another, creates it", () => {
    expect(outcomeOf(typed, NAMESPACES, null)).toBe("add")
    expect(
      outcomeOf({ ...typed, namespace: "team:research" }, NAMESPACES, null)
    ).toBe("create")
  })

  test("with a key another memory holds, replaces that memory", () => {
    expect(outcomeOf({ ...typed, key: "next-trip" }, NAMESPACES, owner)).toBe(
      "replace"
    )
  })

  test("names its namespace and key without the spaces around them", () => {
    const spaced = { ...typed, namespace: " user:alice ", key: " drink " }

    expect(outcomeOf(spaced, NAMESPACES, null)).toBe("add")
    expect(keyToCheck(spaced, NAMESPACES)).toEqual({
      namespace: "user:alice",
      key: "drink",
    })
  })
})

describe("the key of a new memory", () => {
  test("is checked for an owner only in a namespace the file has", () => {
    expect(keyToCheck({ ...typed, key: "drink" }, NAMESPACES)).toEqual({
      namespace: "user:alice",
      key: "drink",
    })
    expect(
      keyToCheck(
        { ...typed, namespace: "team:research", key: "drink" },
        NAMESPACES
      )
    ).toBeNull()
  })

  test("is not checked when there is none", () => {
    expect(keyToCheck({ ...typed, key: "  " }, NAMESPACES)).toBeNull()
  })
})

describe("what adding sends", () => {
  test("adds the text and tags, trimmed, and no key when none was typed", () => {
    const request = requestOf({ ...typed, content: "  Prefers tea\n" }, "add")

    expect(request).toEqual({
      method: "add",
      params: {
        namespace: "user:alice",
        content: "Prefers tea",
        tags: ["food"],
      },
    })
  })

  test("a new namespace is added to like any other: the library creates it", () => {
    const request = requestOf(
      { ...typed, namespace: "team:research", key: "drink" },
      "create"
    )

    expect(request).toEqual({
      method: "add",
      params: {
        namespace: "team:research",
        content: "Prefers tea to coffee",
        tags: ["food"],
        key: "drink",
      },
    })
  })

  test("a replacement puts the text and tags under the key", () => {
    const request = requestOf({ ...typed, key: " next-trip " }, "replace")

    expect(request).toEqual({
      method: "put",
      params: {
        namespace: "user:alice",
        key: "next-trip",
        content: "Prefers tea to coffee",
        tags: ["food"],
      },
    })
  })
})

describe("what the library would refuse in a new memory", () => {
  test.each([
    ["namespace must not contain lone surrogates", "namespace"],
    ["content must not be empty", "content"],
    ["key must not be empty", "key"],
    ["tag must not contain a NUL character", "tags"],
    ["tags must be a list of strings", "tags"],
  ])("the library's %j belongs under the field %s", (message, field) => {
    expect(newFieldOf(message)).toBe(field)
  })

  test("a reason that names no field of the dialog belongs to none", () => {
    expect(newFieldOf("importance must be a number from 0 to 1")).toBeNull()
  })
})
