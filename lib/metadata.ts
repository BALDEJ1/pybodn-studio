export type MetadataRead =
  { ok: true; value: Record<string, unknown> } | { ok: false; message: string }

const NOT_OBJECT = "Metadata must be a JSON object, in curly braces."

/** Metadata as the person reads and edits it. */
export function metadataText(metadata: Record<string, unknown>): string {
  return JSON.stringify(metadata, null, 2)
}

/**
 * The metadata a text holds. It is parsed and never merged into another object, so a key such as
 * `__proto__` stays an ordinary key.
 */
export function readMetadata(text: string): MetadataRead {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return { ok: false, message: `Not valid JSON: ${reason}` }
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, message: NOT_OBJECT }
  }
  return { ok: true, value: value as Record<string, unknown> }
}
