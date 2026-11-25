import type { Field } from "@/lib/form"

/** The element of each field, where the keyboard goes to show the person a problem. */
export const FIELD_IDS: Record<Field, string> = {
  content: "memory-text",
  tags: "memory-tags",
  importance: "memory-importance",
  source: "memory-source",
  expires: "memory-expires",
  metadata: "memory-metadata",
}

/** The reason a field is refused, read out with the field. */
export const errorId = (field: Field) => `${FIELD_IDS[field]}-error`

export const TEXT_HINT_ID = "memory-text-hint"
export const EXPIRES_LABEL_ID = "memory-expires-label"
