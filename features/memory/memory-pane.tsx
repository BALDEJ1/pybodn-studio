"use client"

import { useQuery } from "@tanstack/react-query"

import { Failure } from "@/components/failure"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { setDraft, useDraft } from "@/hooks/use-drafts"
import { ApiError } from "@/lib/api"
import { memoryQuery } from "@/lib/queries"
import { cn } from "@/lib/utils"

import { EditorBar } from "./editor-bar"
import { MemoryEditor } from "./memory-editor"
import type { Moves } from "./use-memory-actions"

type Props = Moves & {
  namespace: string | null
  id: string | null
  onBack: () => void
  className?: string
}

/** The memory picked, to read and edit. */
export function MemoryPane({
  namespace,
  id,
  onBack,
  className,
  ...moves
}: Props) {
  return (
    <section
      aria-label="Memory"
      className={cn("@container flex min-w-0 flex-1 flex-col", className)}
    >
      {namespace !== null && id !== null ? (
        // Each memory starts afresh: its own typed tag, copy button and refused field.
        <MemoryLoader
          key={id}
          namespace={namespace}
          id={id}
          onBack={onBack}
          {...moves}
        />
      ) : (
        <EditorBar onBack={onBack} className="lg:hidden" />
      )}
    </section>
  )
}

function MemoryLoader({
  namespace,
  id,
  onBack,
  ...moves
}: Moves & {
  namespace: string
  id: string
  onBack: () => void
}) {
  const memory = useQuery(memoryQuery(namespace, id))
  const retry = () => void memory.refetch()
  const gone =
    memory.error instanceof ApiError && memory.error.code === "not_found"

  if (memory.data && !gone) {
    return (
      <MemoryEditor
        record={memory.data}
        failure={memory.error}
        onRetry={retry}
        onBack={onBack}
        {...moves}
      />
    )
  }
  return (
    <>
      <EditorBar onBack={onBack} />
      <div className="p-6">
        {gone ? (
          <Gone id={id} />
        ) : memory.error ? (
          <Failure error={memory.error} onRetry={retry} />
        ) : (
          <Skeleton className="h-4 w-3/5" />
        )}
      </div>
    </>
  )
}

/** The memory was deleted elsewhere. Text typed into it can still be copied. */
function Gone({ id }: { id: string }) {
  const draft = useDraft(id)
  const text = draft?.edits.content
  return (
    <div className="flex max-w-3xl flex-col gap-3">
      <Alert>
        <AlertDescription>This memory no longer exists.</AlertDescription>
      </Alert>
      {text !== undefined && (
        <>
          <label htmlFor="gone-text" className="text-sm text-muted-foreground">
            Your unsaved text
          </label>
          <Textarea id="gone-text" dir="auto" readOnly value={text} />
        </>
      )}
      {draft && (
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => setDraft(id, undefined)}
        >
          Discard edits
        </Button>
      )}
    </div>
  )
}
