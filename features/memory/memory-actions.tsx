"use client"

import { useQuery } from "@tanstack/react-query"
import { ArchiveIcon, Trash2Icon } from "lucide-react"
import { useState } from "react"

import { ConfirmDialog, type Ask } from "@/components/confirm-dialog"
import { Button } from "@/components/ui/button"
import { overviewQuery } from "@/lib/queries"
import type { MemoryRecord } from "@/server/bridge/protocol.ts"

import type { useMemoryActions } from "./use-memory-actions"

type Props = {
  record: MemoryRecord
  actions: ReturnType<typeof useMemoryActions>
}

const EXCERPT = 60

/**
 * Archive and Delete in the bar over a memory, each asking first. Below 600 px of editor the
 * buttons show their icons only.
 */
export function MemoryActions({ record, actions }: Props) {
  const [asking, setAsking] = useState<"archive" | "delete" | null>(null)
  const { namespace } = record
  // Deleting the last memory of a namespace takes the namespace too, and the dialog says so.
  const { data: last = false } = useQuery({
    ...overviewQuery,
    select: (overview) => {
      const space = overview.namespaces.find(({ name }) => name === namespace)
      return (
        space !== undefined &&
        space.active + space.archived + space.expired === 1
      )
    },
  })
  const quoted = `“${excerptOf(record.content)}”`

  const asks: Record<"archive" | "delete", Ask> = {
    archive: {
      title: "Archive this memory?",
      text: `${quoted} will be hidden from search and reads. You can restore it from Archived.`,
      action: "Archive",
      destructive: false,
      onConfirm: actions.archive,
    },
    delete: {
      title: "Delete this memory?",
      text: `${quoted} will be deleted from ${namespace}.${
        last ? ` It is the last memory there, so ${namespace} goes too.` : ""
      } This cannot be undone.`,
      action: "Delete",
      destructive: true,
      onConfirm: () => actions.remove(last),
    },
  }

  return (
    <>
      {record.status === "active" && (
        <Button
          variant="outline"
          size="sm"
          title="Archive"
          disabled={actions.isPending}
          onClick={() => setAsking("archive")}
        >
          <ArchiveIcon aria-hidden />
          <span className="@max-[37.5rem]:sr-only">Archive</span>
        </Button>
      )}
      <Button
        variant="outline"
        size="sm"
        title="Delete"
        disabled={actions.isPending}
        onClick={() => setAsking("delete")}
        className="text-destructive hover:text-destructive"
      >
        <Trash2Icon aria-hidden />
        <span className="@max-[37.5rem]:sr-only">Delete</span>
      </Button>
      <ConfirmDialog
        asking={asking}
        asks={asks}
        onClose={() => setAsking(null)}
      />
    </>
  )
}

function excerptOf(text: string): string {
  return text.length > EXCERPT
    ? `${text.slice(0, EXCERPT - 3).trimEnd()}…`
    : text
}
