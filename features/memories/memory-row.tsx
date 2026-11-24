import { Fragment } from "react"

import { useDraft } from "@/hooks/use-drafts"

import { cn } from "@/lib/utils"
import { changedLabel, dayLabel } from "@/lib/when"
import type { Row } from "@/server/bridge/protocol.ts"

type Props = { row: Row; now: Date; selected: boolean; onPick: () => void }

/**
 * One memory in the list: the start of its text, its key, tags and expiry, and when it changed.
 * Each value keeps its own text direction, so a right-to-left mark in one cannot turn another.
 */
export function MemoryRow({ row, now, selected, onPick }: Props) {
  const unsaved = useDraft(row.id) !== undefined
  const facts = [
    row.key && <bdi className="font-mono">{row.key}</bdi>,
    row.tags.length > 0 &&
      row.tags.map((tag, index) => (
        <Fragment key={index}>
          {index > 0 && ", "}
          <bdi>{tag}</bdi>
        </Fragment>
      )),
    row.expires_at &&
      `${row.status === "expired" ? "Expired" : "Expires"} ${dayLabel(new Date(row.expires_at), now)}`,
  ].filter(Boolean)

  return (
    <li>
      <button
        type="button"
        aria-current={selected ? "true" : undefined}
        onClick={onPick}
        className={cn(
          "flex w-full flex-col gap-1 px-4 py-3 text-left outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
          selected &&
            "bg-accent shadow-[inset_2px_0_0_var(--primary)] hover:bg-accent"
        )}
      >
        <span dir="auto" className="line-clamp-2 text-sm wrap-anywhere">
          {row.content}
          {row.cut && "…"}
        </span>
        <span className="flex items-baseline gap-3 text-xs text-muted-foreground">
          <span className="min-w-0 flex-1 truncate">
            {facts.map((fact, index) => (
              <Fragment key={index}>
                {index > 0 && " · "}
                {fact}
              </Fragment>
            ))}
          </span>
          {unsaved && (
            <span
              role="img"
              aria-label="Unsaved changes"
              title="Unsaved changes"
              className="size-1.5 shrink-0 self-center rounded-full bg-foreground"
            />
          )}
          <span className="shrink-0 tabular-nums">
            {changedLabel(new Date(row.updated_at), now)}
          </span>
        </span>
      </button>
    </li>
  )
}
