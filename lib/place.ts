import { VIEWS, type View } from "../server/bridge/protocol.ts"

/**
 * Where the person is in Studio. It lives in the page's address, so a link, the browser's Back
 * and a reload all come back to it.
 */
export type Place = {
  namespace: string | null
  view: View
  query: string
  /** The memory the person picked. With none, a wide screen shows the first row. */
  id: string | null
}

export function placeOf(params: Pick<URLSearchParams, "get">): Place {
  const view = VIEWS.find((name) => name === params.get("view"))
  return {
    namespace: params.get("ns") || null,
    view: view ?? "active",
    query: params.get("q") ?? "",
    id: params.get("id") || null,
  }
}

/** The address of a place, without what is at its start: empty for a fresh Studio. */
export function addressOf(place: Place): string {
  const params = new URLSearchParams()
  if (place.namespace !== null) params.set("ns", place.namespace)
  if (place.view !== "active") params.set("view", place.view)
  if (place.query !== "") params.set("q", place.query)
  if (place.id !== null) params.set("id", place.id)
  const search = params.toString()
  return search === "" ? "" : `?${search}`
}

/** Another namespace starts on Active, with no search and no memory picked. */
export function toNamespace(namespace: string): Place {
  return { namespace, view: "active", query: "", id: null }
}

/** Another tab keeps the search, so a match there is one click away. */
export function toView(place: Place, view: View): Place {
  return { ...place, view, id: null }
}

/**
 * The place as the file allows it: a namespace that is gone, or none named, gives way to the
 * first one, and a memory picked in it goes too.
 */
export function settle(place: Place, namespaces: readonly string[]): Place {
  if (place.namespace !== null && namespaces.includes(place.namespace)) {
    return place
  }
  return { ...place, namespace: namespaces[0] ?? null, id: null }
}

/**
 * The memory the other pane shows: the one picked, even when its tab no longer lists it, except
 * while a search leaves it out, which hides it until the search is cleared. With none picked, the
 * first row.
 */
export function shownId(
  place: Place,
  rows: readonly { id: string }[] | undefined,
  searching: boolean
): string | null {
  if (place.id === null) return rows?.[0]?.id ?? null
  const searchedOut =
    searching && rows !== undefined && !rows.some((row) => row.id === place.id)
  return searchedOut ? null : place.id
}
