"use client"

import { useQuery } from "@tanstack/react-query"
import { ArrowLeftIcon } from "lucide-react"

import { Failure } from "@/components/failure"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { memoryQuery } from "@/lib/queries"
import { cn } from "@/lib/utils"

type Props = {
  namespace: string | null
  id: string | null
  onBack: () => void
  className?: string
}

/** The memory picked, with all of its text. */
export function MemoryPane({ namespace, id, onBack, className }: Props) {
  return (
    <section
      aria-label="Memory"
      className={cn("flex min-w-0 flex-1 flex-col", className)}
    >
      <div className="flex h-13 shrink-0 items-center border-b px-2 lg:hidden">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Back to memories"
          title="Back to memories"
          onClick={onBack}
        >
          <ArrowLeftIcon />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {namespace !== null && id !== null && (
          <MemoryText namespace={namespace} id={id} />
        )}
      </div>
    </section>
  )
}

function MemoryText({ namespace, id }: { namespace: string; id: string }) {
  const memory = useQuery(memoryQuery(namespace, id))
  if (memory.isError) {
    return (
      <Failure error={memory.error} onRetry={() => void memory.refetch()} />
    )
  }
  if (!memory.data) return <Skeleton className="h-4 w-3/5" />
  return (
    <p dir="auto" className="wrap-anywhere whitespace-pre-wrap">
      {memory.data.content}
    </p>
  )
}
