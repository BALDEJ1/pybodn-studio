/**
 * Expiry picked by day. A day starts at its first moment where the person is, and from then on
 * the memory counts as expired: "Expires Nov 25" names the first day it is gone.
 */

/** A day as the calendar takes it: its first moment, in the person's time zone. */
export function dateOfDay(day: string): Date {
  const [year, month, date] = day.split("-").map(Number)
  return new Date(year, month - 1, date)
}

/** The day of a calendar date, as "2026-11-25". */
export function dayOfDate(date: Date): string {
  const pad = (value: number, width = 2) => String(value).padStart(width, "0")
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** The moment to save for a day; none for no day. */
export function momentOf(day: string): string | null {
  return day === "" ? null : dateOfDay(day).toISOString()
}

/** The day a saved moment falls on where the person is; empty for none. */
export function dayOf(moment: string | null): string {
  return moment === null ? "" : dayOfDate(new Date(moment))
}
