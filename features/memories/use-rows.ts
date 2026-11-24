"use client"

import { useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"

import { listQuery, searchQuery } from "@/lib/queries"
import { VIEWS, type View } from "@/server/bridge/protocol.ts"

const SEARCH_DELAY = 200

export type Counts = Record<View, number>

/**
 * The rows of a tab: its newest memories, or, while searching, every match in it, with the
 * matches of each tab counted. Nothing is read while `namespace` is null.
 */
export function useRows(namespace: string | null, view: View, query: string) {
  const term = useSearchTerm(query)
  const searching = term !== ""
  const list = useQuery({
    ...listQuery(namespace ?? "", view),
    enabled: namespace !== null && !searching,
  })
  const search = useQuery({
    ...searchQuery(namespace ?? "", term),
    enabled: namespace !== null && searching,
  })
  if (!searching) {
    return {
      searching,
      rows: list.data?.rows,
      /** How many memories the tab holds, when it shows only the newest of them. */
      total: list.data?.total,
      counts: undefined,
      read: list,
    }
  }
  const views = search.data?.views
  const counts = views
    ? (Object.fromEntries(
        VIEWS.map((name) => [name, views[name].length])
      ) as Counts)
    : undefined
  return {
    searching,
    rows: views?.[view],
    total: undefined,
    counts,
    read: search,
  }
}

export type Rows = ReturnType<typeof useRows>

/** The words to look for: those typed, once typing stops; none at once when the field is cleared. */
function useSearchTerm(query: string): string {
  const typed = query.trim()
  const [term, setTerm] = useState(typed)
  // Forget the old words on clearing, so the next letter cannot bring back their matches.
  if (typed === "" && term !== "") setTerm("")
  useEffect(() => {
    if (typed === "") return
    const timer = setTimeout(() => setTerm(typed), SEARCH_DELAY)
    return () => clearTimeout(timer)
  }, [typed])
  return typed === "" ? "" : term
}
