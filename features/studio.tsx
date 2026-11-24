"use client"

import { MemoryScreen } from "./memory-screen"
import { SetupScreen } from "./setup/setup-screen"
import { StartingScreen } from "./setup/starting-screen"
import { UnreachableScreen } from "./setup/unreachable-screen"
import { useBridgeStatus } from "./setup/use-bridge-status"

/** Starting, a problem to fix, Studio gone, or the file. */
export function Studio() {
  const status = useBridgeStatus()
  if (status.isError || status.data?.state === "stopped") {
    return <UnreachableScreen />
  }
  if (!status.data || status.data.state === "starting") {
    return <StartingScreen />
  }
  if (status.data.state === "setup") {
    return <SetupScreen problem={status.data.problem} />
  }
  return <MemoryScreen path={status.data.path} />
}
