import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query"

import { needsStatusCheck, STATUS_KEY } from "./api"

/**
 * The page's cache of data from the server. A failed read or change may mean that the bridge
 * stopped or that Studio's server is gone. The page then asks for the status again, which brings
 * up the screen that says so, whichever screen made the request.
 */
export function createQueryClient(): QueryClient {
  const recheck = (error: Error) => {
    if (!needsStatusCheck(error)) return
    // Several failures at once share one request for the status.
    void client.invalidateQueries(
      { queryKey: STATUS_KEY },
      { cancelRefetch: false }
    )
  }
  const client = new QueryClient({
    queryCache: new QueryCache({
      // A failure of the status itself is shown as it is: asking again would only repeat it.
      onError: (error, query) => {
        if (query.queryKey[0] !== STATUS_KEY[0]) recheck(error)
      },
    }),
    mutationCache: new MutationCache({ onError: recheck }),
    defaultOptions: {
      // Studio's own server is on this computer; a failed read is shown, not retried.
      queries: { retry: false, refetchOnWindowFocus: false },
    },
  })
  return client
}
