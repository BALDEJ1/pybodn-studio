import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { canRetry } from "@/lib/api"

type Props = { error: Error; onRetry: () => void; className?: string }

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
