/** The reason a field is refused, shown under it. */
export function FieldError({
  id,
  message,
}: {
  id: string
  message: string | undefined
}) {
  if (message === undefined) return null
  return (
    <p id={id} className="mt-1 text-xs text-destructive">
      {message}
    </p>
  )
}

/**
 * Ties a field to the reason it is refused, when it is, and to its hints, so a screen reader
 * reads them out with it.
 */
export function fieldAria(
  errorId: string | null,
  ...hints: (string | false | undefined)[]
) {
  return {
    "aria-invalid": errorId !== null,
    "aria-describedby":
      [errorId, ...hints].filter(Boolean).join(" ") || undefined,
  }
}
