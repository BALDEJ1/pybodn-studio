"use client"

import { FileOverview } from "./overview/file-overview"
import { SetupScreen } from "./setup/setup-screen"
import { StartingScreen } from "./setup/starting-screen"
import { useBridgeStatus } from "./setup/use-bridge-status"

/** Starting, a problem to fix, or the file. */
export function Studio() {
  const status = useBridgeStatus()
  if (status.isError) {
    return (
      <SetupScreen
        problem={{
          code: "bridge_failed",
          message: status.error.message,
          path: null,
        }}
      />
    )
  }
  if (!status.data || status.data.state === "starting") {
    return <StartingScreen />
  }
  if (status.data.state === "setup") {
    return <SetupScreen problem={status.data.problem} />
  }
  return <FileOverview path={status.data.path} />
}
