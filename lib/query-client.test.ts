import { QueryObserver, type QueryClient } from "@tanstack/react-query"
import { describe, expect, test, vi } from "vitest"

import { ApiError, STATUS_KEY } from "./api"
import { createQueryClient } from "./query-client"

/** A page that shows the bridge's status, as Studio always does. */
function pageWithStatus(status: () => Promise<unknown>) {
  const client = createQueryClient()
  const fetchStatus = vi.fn(status)
  new QueryObserver(client, {
    queryKey: STATUS_KEY,
    queryFn: fetchStatus,
  }).subscribe(() => {})
  return { client, fetchStatus }
}

function failRead(client: QueryClient, name: string, error: Error) {
  return client
    .fetchQuery({ queryKey: [name], queryFn: () => Promise.reject(error) })
    .catch(() => {})
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20))
const ready = async () => ({ state: "ready" })

describe("after a failed request", () => {
  test.each([
    ["the bridge cannot open the file", new ApiError(503, "setup", "no file")],
    ["Studio's server is gone", new TypeError("Failed to fetch")],
  ])("the page asks for the status again when %s", async (_, error) => {
    const { client, fetchStatus } = pageWithStatus(ready)
    await settle()

    await failRead(client, "overview", error)
    await settle()

    expect(fetchStatus).toHaveBeenCalledTimes(2)
  })

  test("a failure the screen handles itself leaves the status alone", async () => {
    const { client, fetchStatus } = pageWithStatus(ready)
    await settle()

    await failRead(client, "overview", new ApiError(409, "conflict", "v3"))
    await settle()

    expect(fetchStatus).toHaveBeenCalledTimes(1)
  })

  test("several failures at once ask for the status once", async () => {
    const { client, fetchStatus } = pageWithStatus(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
      return { state: "ready" }
    })
    await settle()
    const lost = new ApiError(502, "lost", "stopped")

    await Promise.all([
      failRead(client, "overview", lost),
      failRead(client, "list", lost),
    ])
    await settle()

    expect(fetchStatus).toHaveBeenCalledTimes(2)
  })

  test("a status that fails is not asked for again by itself", async () => {
    const { fetchStatus } = pageWithStatus(() =>
      Promise.reject(new TypeError("Failed to fetch"))
    )

    await settle()
    await settle()

    expect(fetchStatus).toHaveBeenCalledTimes(1)
  })
})
