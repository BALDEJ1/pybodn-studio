import type { MemoryRecord, Params } from "@/server/bridge/protocol.ts"

import { fieldNamed } from "./reason"

/** What the person typed into the New memory dialog. */
export type NewMemory = {
  namespace: string
  content: string
  tags: readonly string[]
  /** Empty for none. */
  key: string
}

export type NewField = keyof NewMemory

/** What adding does: add to a namespace, create one with it, or replace the memory with the key. */
export type Outcome = "add" | "create" | "replace"

export type Request =
  | { method: "add"; params: Params<"add"> }
  | { method: "put"; params: Params<"put"> }

/** A namespace and text are needed; tags and a key are not. */
export function isReady(memory: NewMemory): boolean {
  return memory.namespace.trim() !== "" && memory.content.trim() !== ""
}

/**
 * The key to look up before adding. Only a namespace the file has can hold it; as in the library,
 * an archived or expired memory holds its key too.
 */
export function keyToCheck(
  memory: NewMemory,
  namespaces: readonly string[]
): { namespace: string; key: string } | null {
  const namespace = memory.namespace.trim()
  const key = memory.key.trim()
  return key !== "" && namespaces.includes(namespace)
    ? { namespace, key }
    : null
}

/** `owner` is the memory that holds the key, as looked up. */
export function outcomeOf(
  memory: NewMemory,
  namespaces: readonly string[],
  owner: MemoryRecord | null
): Outcome {
  if (owner) return "replace"
  return namespaces.includes(memory.namespace.trim()) ? "add" : "create"
}

/**
 * The call that does it. A replacement puts the text and tags under the key, and the library
 * resets every other field of that memory. Without a known owner the memory is added, so a key
 * taken in the meantime is refused rather than replaced unseen.
 */
export function requestOf(memory: NewMemory, outcome: Outcome): Request {
  const namespace = memory.namespace.trim()
  const content = memory.content.trim()
  const key = memory.key.trim()
  const tags = [...memory.tags]
  if (outcome === "replace") {
    return { method: "put", params: { namespace, key, content, tags } }
  }
  return {
    method: "add",
    params: { namespace, content, tags, ...(key !== "" && { key }) },
  }
}

const NAMED: Readonly<Record<string, NewField>> = {
  namespace: "namespace",
  content: "content",
  key: "key",
  tag: "tags",
  tags: "tags",
}

/** The field of the dialog a reason of the library is about. */
export function newFieldOf(message: string): NewField | null {
  return fieldNamed(message, NAMED)
}
