import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { ApiError } from "@/lib/api"

// These fail the same way every time: only other words, or another memory, help.
const FINAL: ReadonlySet<string> = new Set(["invalid", "not_found"])

type Props = { error: Error; onRetry: () => void; className?: string }

/** Whether trying the same request again can go another way. */
export function canRetry(error: Error): boolean {
  return !(error instanceof ApiError && FINAL.has(error.code))
}

/** A read that failed: the reason, and "Retry" when trying again can help. */
export function Failure({ error, onRetry, className }: Props) {
  return (
    <Alert variant="destructive" className={className}>
      <AlertDescription>{error.message}</AlertDescription>
      {canRetry(error) && (
        <AlertAction>
          <Button variant="outline" size="sm" onClick={onRetry}>
            Retry
          </Button>
        </AlertAction>
      )}
    </Alert>
  )
}
