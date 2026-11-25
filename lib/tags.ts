/**
 * `tags` with each comma-separated tag in `typed` added, as the library keeps them: trimmed, none
 * empty, none twice, in the order typed.
 */
export function withTags(tags: readonly string[], typed: string): string[] {
  const fresh = typed
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
  return [...new Set([...tags, ...fresh])]
}

/** The tag field's text: tags finished by a comma, and what is still being typed after it. */
export function splitTyped(value: string): { done: string; rest: string } {
  const cut = value.lastIndexOf(",")
  if (cut === -1) return { done: "", rest: value }
  return { done: value.slice(0, cut), rest: value.slice(cut + 1).trimStart() }
}
