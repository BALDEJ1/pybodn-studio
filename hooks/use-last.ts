"use client"

import { useState } from "react"

/** `value`, or while it is null the last one it had: the words of a dialog stay as it fades out. */
export function useLast<T extends string>(value: T | null): T | null {
  const [last, setLast] = useState<T | null>(value)
  if (value !== null && value !== last) setLast(value)
  return value ?? last
}
