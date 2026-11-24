"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { fetchStatus, retryStatus, STATUS_KEY } from "@/lib/api"

const STARTING_POLL = 1_000

/** Where the bridge is, asked again every second while it starts. */
export function useBridgeStatus() {
  return useQuery({
    queryKey: STATUS_KEY,
    queryFn: fetchStatus,
    refetchInterval: (query) =>
      query.state.data?.state === "starting" ? STARTING_POLL : false,
  })
}

/** Starts the bridge again. A retry that fails asks for the status, as every failure does. */
export function useRetry() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: retryStatus,
    onSuccess: (status) => client.setQueryData(STATUS_KEY, status),
  })
}
