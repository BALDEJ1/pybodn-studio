export type MetadataRead =
  { ok: true; value: Record<string, unknown> } | { ok: false; message: string }

const NOT_OBJECT = "Metadata must be a JSON object, in curly braces."
const TOO_LARGE =
  "A whole number this large would lose digits. Put it in quotes to keep it as text."

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
  if (losesDigits(value)) return { ok: false, message: TOO_LARGE }
  return { ok: true, value: value as Record<string, unknown> }
}

// The browser reads every number as a double, so a whole number past 2^53 comes back changed.
function losesDigits(value: unknown): boolean {
  if (typeof value === "number") {
    return Number.isInteger(value) && !Number.isSafeInteger(value)
  }
  if (value !== null && typeof value === "object") {
    return Object.values(value).some(losesDigits)
  }
  return false
}
