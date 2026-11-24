import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { ApiError } from "@/lib/api"

// These fail the same way every time: only other words, or another memory, help.
const FINAL: ReadonlySet<string> = new Set(["invalid", "not_found"])

type Props = { error: Error; onRetry: () => void; className?: string }

/** A read that failed: the reason, and "Retry" when trying again can help. */
export function Failure({ error, onRetry, className }: Props) {
  const canRetry = !(error instanceof ApiError && FINAL.has(error.code))
  return (
    <Alert variant="destructive" className={className}>
      <AlertDescription>{error.message}</AlertDescription>
      {canRetry && (
        <AlertAction>
          <Button variant="outline" size="sm" onClick={onRetry}>
            Retry
          </Button>
        </AlertAction>
      )}
    </Alert>
  )
}
