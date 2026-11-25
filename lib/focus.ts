/**
 * Where the keyboard goes once what it was on is gone or out of sight, such as a button of a memory
 * just archived or the row of a list a phone has just covered: into the memory when it fills the
 * screen, otherwise to the nearest row of the list.
 */

// Tailwind's lg: from here up the list and the memory stand side by side.
const WIDE = "(min-width: 64rem)"

export const LIST_ID = "memories"
export const PANE_ID = "memory"
export const SEARCH_ID = "memory-search"

const ROW = "[data-row]"
// Base UI marks a dialog, a sheet or a popover that is open with `data-open`.
const OPEN_OVER_PAGE =
  '[role="dialog"][data-open], [role="alertdialog"][data-open]'

// The memory last in view, and where its row stood, to find the row that takes its place.
let last: { id: string; index: number } | null = null
// "/" pressed while the memory covered the search, which shows once the page is back at the list.
let searchWanted = false

/** Whether the list and the memory stand side by side; below that one pane shows at a time. */
export function isWide(): boolean {
  return window.matchMedia(WIDE).matches
}

export function isShown(element: Element | null): element is HTMLElement {
  return (
    element instanceof HTMLElement &&
    element.isConnected &&
    element.getClientRects().length > 0
  )
}

/** Whether a dialog, a sheet or a popover is open over the page. */
export function isOverlaid(): boolean {
  return document.querySelector(OPEN_OVER_PAGE) !== null
}

/** The memory in view, at row `index` of its list. */
export function noteShown(id: string, index: number): void {
  last = { id, index }
}

/** Puts the keyboard in the search field, as after a button that clears or moves the search. */
export function focusSearch(): void {
  document.getElementById(SEARCH_ID)?.focus()
}

/** The search field gets the keyboard once the page has moved back to the list. */
export function focusSearchAfterMove(): void {
  searchWanted = true
}

/** The row the list's one Tab stop is on. */
export function focusTabStop(): void {
  document
    .getElementById(LIST_ID)
    ?.querySelector<HTMLElement>(`${ROW}[tabindex="0"]`)
    ?.focus()
}

/**
 * The memory when it fills the screen; otherwise the row nearest the memory last in view: the row
 * of the memory beside the list, the last memory's own row, or the one now in its place.
 */
export function focusNearest(): void {
  const pane = document.getElementById(PANE_ID)
  const list = document.getElementById(LIST_ID)
  if (isShown(pane) && !isShown(list)) {
    pane.focus()
    return
  }
  if (!isShown(list)) return
  const rows = [...list.querySelectorAll<HTMLElement>(ROW)]
  const beside = isShown(pane)
    ? rows.find((row) => row.getAttribute("aria-current") === "true")
    : undefined
  const target =
    beside ??
    rows.find((row) => row.dataset.row === last?.id) ??
    rows[Math.min(last?.index ?? 0, rows.length - 1)] ??
    document.getElementById(SEARCH_ID)
  target?.focus()
}

/** After something closed or changed: the keyboard moves on only if it was left on nothing. */
export function rescueFocus(): void {
  requestAnimationFrame(() => {
    if (isLost(document.activeElement)) focusNearest()
  })
}

/** After the page moved to another place: as `rescueFocus`, or to the search if it was asked for. */
export function settleFocusAfterMove(): void {
  requestAnimationFrame(() => {
    const wanted = searchWanted
    searchWanted = false
    const search = document.getElementById(SEARCH_ID)
    if (wanted && isShown(search)) search.focus()
    else if (isLost(document.activeElement)) focusNearest()
  })
}

function isLost(active: Element | null): boolean {
  return (
    active === null ||
    active === document.body ||
    !isShown(active) ||
    active.matches(":disabled")
  )
}
