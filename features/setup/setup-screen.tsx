"use client"

import { Button } from "@/components/ui/button"
import type { Problem } from "@/server/bridge/client.ts"

import { ADVICE } from "./advice"
import { useRetry } from "./use-bridge-status"

/** What stops Studio from opening the file, and how to fix it. */
export function SetupScreen({ problem }: { problem: Problem }) {
  const advice = ADVICE[problem.code]
  const retry = useRetry()
  return (
    <main
      data-problem={problem.code}
      className="flex min-h-svh items-center justify-center p-6"
    >
      <div className="flex w-full max-w-lg flex-col gap-3">
        <h1 className="text-lg font-medium">{advice.title}</h1>
        {problem.path && (
          <p className="font-mono text-sm break-all">{problem.path}</p>
        )}
        <p className="text-sm text-muted-foreground">{advice.fix}</p>
        {advice.command && (
          <pre className="overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-sm">
            {advice.command}
          </pre>
        )}
        {advice.showReason && (
          <p className="text-sm whitespace-pre-wrap text-muted-foreground">
            {problem.message}
          </p>
        )}
        {!advice.needsRestart && (
          <Button
            className="self-start"
            variant="outline"
            disabled={retry.isPending}
            onClick={() => retry.mutate()}
          >
            Try again
          </Button>
        )}
      </div>
    </main>
  )
}
