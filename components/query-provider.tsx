"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useState } from "react"

/** The cache of data from the server, one per browser tab. */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          // Studio's own server is on this computer; a failed read is shown, not retried.
          queries: { retry: false, refetchOnWindowFocus: false },
        },
      })
  )
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
