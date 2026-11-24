"use client"

import { useQuery } from "@tanstack/react-query"

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { usePlace } from "@/hooks/use-place"
import { settle, shownId, toNamespace } from "@/lib/place"
import { overviewQuery } from "@/lib/queries"
import { cn } from "@/lib/utils"

import { MemoryList } from "./memories/memory-list"
import { useRows } from "./memories/use-rows"
import { MemoryPane } from "./memory/memory-pane"
import { NamespaceSidebar } from "./namespaces/namespace-sidebar"

/**
 * The namespaces of the file, the memories of one, and the memory picked. Below 1024 px one pane
 * shows at a time.
 */
export function MemoryScreen({ path }: { path: string }) {
  const { place: asked, go, back } = usePlace()
  const overview = useQuery(overviewQuery)
  const spaces = overview.data?.namespaces
  const place = spaces
    ? settle(
        asked,
        spaces.map((space) => space.name)
      )
    : asked
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

  return (
    // On a wide screen the sidebar always stands beside the list; on a phone it slides in.
    <SidebarProvider open>
      <NamespaceSidebar
        path={path}
        namespaces={spaces}
        loading={overview.isPending}
        current={place.namespace}
        onPick={(name) => go(toNamespace(name))}
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
        />
        <MemoryPane
          className={cn(!picked && "max-lg:hidden")}
          namespace={place.namespace}
          id={shown}
          onBack={() => back({ ...place, id: null })}
        />
      </SidebarInset>
    </SidebarProvider>
  )
}
