"use client"

import { PlusIcon } from "lucide-react"

import { Failure } from "@/components/failure"
import { Button } from "@/components/ui/button"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useNow } from "@/hooks/use-now"
import type { Go } from "@/hooks/use-place"
import { isWide, LIST_ID } from "@/lib/focus"
import { rowAfter } from "@/lib/keys"
import { toView, type Place } from "@/lib/place"
import { cn } from "@/lib/utils"
import { VIEW_NAMES } from "@/lib/view-names"
import { VIEWS } from "@/server/bridge/protocol.ts"

import { ListEmpty } from "./list-empty"
import { MemoryRow } from "./memory-row"
import { SearchBox } from "./search-box"
import type { Opening } from "../new-memory/new-memory-dialog"
import type { Counts, Rows } from "./use-rows"

const SKELETON_ROWS = 6

type Props = {
  place: Place
  go: Go
  rows: Rows
  counts: Counts | undefined
  /** True until the namespaces, and the rows of the one open, have been read once. */
  loading: boolean
  /** The memory the other pane shows. */
  shown: string | null
  failure: Error | null
  onRetry: () => void
  onNew: (opening: Opening) => void
  className?: string
}

/** The namespace open: its tabs, the search and the rows. */
export function MemoryList(props: Props) {
  const { place, go, counts, loading, failure, onRetry, onNew, className } =
    props
  const title = place.namespace ?? "No namespace"
  const pickView = (value: unknown) => {
    const view = VIEWS.find((name) => name === value)
    if (view) go(toView(place, view))
  }

  return (
    <section
      id={LIST_ID}
      aria-label="Memories"
      className={cn(
        "flex min-w-0 flex-1 flex-col lg:max-w-md lg:border-r",
        className
      )}
    >
      <header className="flex h-13 shrink-0 items-center gap-2 border-b px-4 max-md:pl-2">
        <SidebarTrigger className="md:hidden" aria-label="Open namespaces" />
        <h1
          dir="auto"
          title={title}
          className="min-w-0 flex-1 truncate text-sm font-semibold"
        >
          {title}
        </h1>
        {place.namespace !== null && (
          <Button variant="outline" size="sm" onClick={() => onNew("memory")}>
            <PlusIcon aria-hidden />
            New memory
          </Button>
        )}
      </header>
      <Tabs
        value={place.view}
        onValueChange={pickView}
        className="min-h-0 flex-1 gap-0"
      >
        <TabsList
          variant="line"
          className="h-10 w-full shrink-0 justify-start gap-4 rounded-none border-b px-4"
        >
          {VIEWS.map((view) => (
            <TabsTrigger key={view} value={view} className="flex-none px-0">
              {VIEW_NAMES[view]}{" "}
              <span className="text-muted-foreground tabular-nums">
                {counts?.[view]}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
        <SearchBox
          query={place.query}
          onChange={(query, typing) =>
            go({ ...place, query }, { replace: typing })
          }
        />
        {failure && (
          <Failure error={failure} onRetry={onRetry} className="m-2 w-auto" />
        )}
        <TabsContent
          value={place.view}
          aria-busy={loading}
          // The rows and buttons in it take the keyboard; the panel itself is no extra stop.
          tabIndex={-1}
          className="min-h-0 overflow-y-auto"
        >
          {loading ? !failure && <RowSkeletons /> : <Shown {...props} />}
        </TabsContent>
      </Tabs>
    </section>
  )
}

function Shown({ place, go, rows, counts, shown, onNew }: Props) {
  const now = useNow()
  const list = rows.rows ?? []
  if (list.length === 0) {
    return (
      <ListEmpty
        place={place}
        go={go}
        searching={rows.searching}
        counts={counts}
        onNew={onNew}
      />
    )
  }
  // One Tab stop for the whole list, on the memory shown; the arrows, Home and End move along it.
  const tabStop = list.some((row) => row.id === shown) ? shown : list[0].id
  const move = (event: React.KeyboardEvent<HTMLUListElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    const buttons = [
      ...event.currentTarget.querySelectorAll<HTMLElement>("[data-row]"),
    ]
    const at = buttons.findIndex((button) => button === document.activeElement)
    const next = rowAfter(event.key, at, buttons.length)
    if (next === null) return
    event.preventDefault()
    buttons[next].focus()
    // Beside the list the memory follows the keyboard; on a phone it would cover the list.
    const id = buttons[next].dataset.row
    if (isWide() && id !== undefined) go({ ...place, id }, { replace: true })
  }
  return (
    <>
      <ul aria-label="Memory list" onKeyDown={move}>
        {list.map((row) => (
          <MemoryRow
            key={row.id}
            row={row}
            now={now}
            selected={row.id === shown}
            tabStop={row.id === tabStop}
            onPick={() => go({ ...place, id: row.id })}
          />
        ))}
      </ul>
      {rows.total !== undefined && rows.total > list.length && (
        <p className="px-4 py-3 text-center text-xs text-muted-foreground">
          Showing newest {list.length} of {rows.total}
        </p>
      )}
    </>
  )
}

function RowSkeletons() {
  return Array.from({ length: SKELETON_ROWS }, (_, index) => (
    <div key={index} className="flex flex-col gap-2 px-4 py-3">
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="h-3 w-2/5" />
    </div>
  ))
}
