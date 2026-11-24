"use client"

import { useQuery } from "@tanstack/react-query"

import { callMemory } from "@/lib/api"

/** The file and its namespaces with their counts. The full memory screen replaces it. */
export function FileOverview({ path }: { path: string }) {
  const overview = useQuery({
    queryKey: ["overview"],
    queryFn: () => callMemory("overview", {}),
  })
  return (
    <main className="mx-auto flex min-h-svh max-w-lg flex-col gap-4 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-medium">PyBodn Studio</h1>
        <p className="font-mono text-sm break-all text-muted-foreground">
          {path}
        </p>
      </div>
      {overview.isError && (
        <p role="alert" className="text-sm text-destructive">
          {overview.error.message}
        </p>
      )}
      {overview.data && (
        <ul className="flex flex-col divide-y rounded-md border text-sm">
          {overview.data.namespaces.map((space) => (
            <li
              key={space.name}
              className="flex justify-between gap-4 px-3 py-2"
            >
              <span className="truncate">{space.name}</span>
              <span className="text-muted-foreground tabular-nums">
                {space.active} active · {space.archived} archived ·{" "}
                {space.expired} expired
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
