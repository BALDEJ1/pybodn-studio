const MINUTE = 60_000
const HOUR = 60 * MINUTE

/** When a memory last changed, as its row shows it: "Just now", "5 min ago", "Yesterday", "Nov 4". */
export function changedLabel(at: Date, now: Date): string {
  const passed = now.getTime() - at.getTime()
  if (passed < MINUTE) return "Just now"
  if (passed < HOUR) return `${Math.floor(passed / MINUTE)} min ago`
  if (sameDay(at, now)) return `${Math.floor(passed / HOUR)} h ago`
  const yesterday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - 1
  )
  if (sameDay(at, yesterday)) return "Yesterday"
  return dayLabel(at, now)
}

/** A day in the person's time zone: "Nov 4", and "Nov 4, 2025" when it is not this year. */
export function dayLabel(at: Date, now: Date): string {
  return at.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: at.getFullYear() === now.getFullYear() ? undefined : "numeric",
  })
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}
