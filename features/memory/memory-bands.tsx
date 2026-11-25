import { ArchiveIcon, ClockIcon, TriangleAlertIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useNow } from "@/hooks/use-now"
import { dayLabel } from "@/lib/when"
import type { MemoryRecord } from "@/server/bridge/protocol.ts"

function Band({
  icon,
  title,
  text,
  children,
}: {
  icon: React.ReactNode
  title: string
  text: string
  children?: React.ReactNode
}) {
  return (
    // In a narrow pane the buttons move under the text rather than squeeze it.
    <div className="flex min-h-11 shrink-0 flex-wrap items-center gap-x-2 gap-y-1.5 bg-muted py-1.5 pr-3 pl-5 text-sm">
      <div className="flex min-w-56 flex-1 items-center gap-2 [&>svg]:size-4 [&>svg]:shrink-0">
        {icon}
        <p className="min-w-0 flex-1">
          <span className="font-medium">{title}</span>
          <span className="ml-1.5 text-muted-foreground">{text}</span>
        </p>
      </div>
      {children && <div className="ml-auto flex gap-2">{children}</div>}
    </div>
  )
}

type StatusProps = {
  record: MemoryRecord
  /** Whether the draft still keeps the expiry, so it can be removed. */
  hasExpiry: boolean
  onRemoveExpiry: () => void
}

/** Why an archived or expired memory is out of reads, as it is saved. */
export function StatusBand({ record, hasExpiry, onRemoveExpiry }: StatusProps) {
  const now = useNow()
  if (record.status === "archived") {
    return (
      <Band
        icon={<ArchiveIcon aria-hidden />}
        title="Archived"
        text="Hidden from search and reads."
      />
    )
  }
  if (record.status !== "expired" || record.expires_at === null) return null
  return (
    <Band
      icon={<ClockIcon aria-hidden />}
      title={`Expired ${dayLabel(new Date(record.expires_at), now)}`}
      text={
        record.archived_at
          ? "Also archived. Hidden from search and reads."
          : "Hidden from search and reads."
      }
    >
      {hasExpiry && (
        <Button variant="outline" size="xs" onClick={onRemoveExpiry}>
          Remove expiry
        </Button>
      )}
    </Band>
  )
}

type ConflictProps = { onLoadLatest: () => void; onKeepMine: () => void }

/** Someone saved the memory after the edits began: take their version, or save the edits over it. */
export function ConflictBand({ onLoadLatest, onKeepMine }: ConflictProps) {
  return (
    <div role="alert">
      <Band
        icon={<TriangleAlertIcon aria-hidden />}
        title="Changed elsewhere"
        text="Someone saved this memory after you started editing."
      >
        <Button variant="outline" size="xs" onClick={onLoadLatest}>
          Load latest
        </Button>
        <Button size="xs" onClick={onKeepMine}>
          Keep mine
        </Button>
      </Band>
    </div>
  )
}
