"use client"

import { useQuery } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { useLeaveWarning } from "@/hooks/use-drafts"
import { isStillAt, usePlace } from "@/hooks/use-place"
import { useShortcut } from "@/hooks/use-shortcut"
import {
  focusSearch,
  focusSearchAfterMove,
  isShown,
  isWide,
  noteShown,
  rescueFocus,
  SEARCH_ID,
  settleFocusAfterMove,
} from "@/lib/focus"
import {
  addressOf,
  placeAfterLeaving,
  settle,
  shownId,
  toNamespace,
} from "@/lib/place"
import { overviewQuery } from "@/lib/queries"
import { cn } from "@/lib/utils"

import { MemoryList } from "./memories/memory-list"
import { useRows } from "./memories/use-rows"
import { MemoryPane } from "./memory/memory-pane"
import { NamespaceSidebar } from "./namespaces/namespace-sidebar"
import { NewMemoryDialog, type Opening } from "./new-memory/new-memory-dialog"
import { UpkeepDialogs, type Upkeep } from "./upkeep/file-upkeep"

/**
 * The namespaces of the file, the memories of one, and the memory picked. Below 1024 px one pane
 * shows at a time.
 */
export function MemoryScreen({ path }: { path: string }) {
  const { place: asked, go, back } = usePlace()
  useLeaveWarning()
  const overview = useQuery(overviewQuery)
  const spaces = overview.data?.namespaces
  const names = spaces?.map((space) => space.name) ?? []
  const place = spaces ? settle(asked, names) : asked
  const [opening, setOpening] = useState<Opening | null>(null)
  const [upkeep, setUpkeep] = useState<Upkeep | null>(null)
  // Nothing is read from a namespace before the file says which ones it has.
  const rows = useRows(spaces ? place.namespace : null, place.view, place.query)
  const loading = !spaces || (place.namespace !== null && !rows.rows)
  // The memory waits for the namespaces too: a link to one that is gone, or namespaces that
  // could not be read, leaves the list in view with the reason.
  const shown = spaces ? shownId(place, rows.rows, rows.searching) : null
  // Below 1024 px the memory fills the screen once one is picked and can be shown.
  const picked = place.id !== null && shown !== null
  const counts = rows.searching
    ? rows.counts
    : spaces?.find((space) => space.name === place.namespace)

  // An archived or deleted memory gives way to its neighbour; on a phone, leaving it is its Back.
  // Someone who moved on while the write ran stays where they went. The keyboard, left on a
  // button now gone, goes to the row nearest the memory.
  const leave = (id: string) => {
    if (!isStillAt(asked)) return
    const wide = isWide()
    const next = placeAfterLeaving(place, rows.rows ?? [], id, wide)
    if (wide) go(next, { replace: true })
    else back(next)
    rescueFocus()
  }

  // After each move the keyboard goes on from what the move covered or took away: on a phone,
  // into the memory just opened, or back to the row of the memory just left.
  const address = addressOf(asked)
  const before = useRef(address)
  useEffect(() => {
    if (before.current !== address) settleFocusAfterMove()
    before.current = address
  }, [address])
  // Only a memory in view counts: once a phone goes back to the list, the memory just left is
  // still the last, and its row, or the one now in its place, takes the keyboard.
  useEffect(() => {
    if (shown === null || !(picked || isWide())) return
    const index = rows.rows?.findIndex((row) => row.id === shown) ?? -1
    if (index !== -1) noteShown(shown, index)
  })

  useShortcut("search", () => {
    if (isShown(document.getElementById(SEARCH_ID))) focusSearch()
    else if (picked) {
      focusSearchAfterMove()
      back({ ...place, id: null })
    }
  })
  useShortcut("new", () => {
    if (spaces) setOpening(place.namespace === null ? "namespace" : "memory")
  })

  return (
    // On a wide screen the sidebar always stands beside the list; on a phone it slides in.
    <SidebarProvider open>
      <NamespaceSidebar
        path={path}
        namespaces={spaces}
        loading={overview.isPending}
        current={place.namespace}
        expired={overview.data?.expired}
        onPick={(name) => go(toNamespace(name))}
        onNewNamespace={() => setOpening("namespace")}
        onUpkeep={setUpkeep}
      />
      <SidebarInset className="h-svh flex-row overflow-hidden">
        <MemoryList
          className={cn(picked && "max-lg:hidden")}
          place={place}
          go={go}
          rows={rows}
          counts={counts}
          loading={loading}
          shown={shown}
          failure={overview.error ?? rows.read.error}
          onRetry={() =>
            void (overview.error ? overview.refetch() : rows.read.refetch())
          }
          onNew={setOpening}
        />
        <MemoryPane
          className={cn(!picked && "max-lg:hidden")}
          namespace={place.namespace}
          id={shown}
          onBack={() => back({ ...place, id: null })}
          onLeave={leave}
          onShow={(record) =>
            go({ ...toNamespace(record.namespace), id: record.id })
          }
        />
      </SidebarInset>
      <NewMemoryDialog
        opening={opening}
        namespaces={names}
        current={place.namespace}
        onClose={() => setOpening(null)}
        onAdded={(record) => {
          setOpening(null)
          // The memory opens, on Active, where it now is.
          go({ ...toNamespace(record.namespace), id: record.id })
        }}
      />
      <UpkeepDialogs
        asking={upkeep}
        expired={overview.data?.expired ?? 0}
        onClose={() => setUpkeep(null)}
        onPurged={(gone) => {
          if (shown !== null && gone.has(shown) && isStillAt(asked)) {
            go({ ...place, id: null }, { replace: true })
          }
        }}
      />
    </SidebarProvider>
  )
}
