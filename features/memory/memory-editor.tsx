"use client"

import { Loader2Icon } from "lucide-react"
import { useEffect, useEffectEvent, useState } from "react"

import { Failure } from "@/components/failure"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { readDraft, setDraft, useDraft } from "@/hooks/use-drafts"
import { useNow } from "@/hooks/use-now"
import {
  changedElsewhere,
  edit,
  formWith,
  problemsOf,
  rebase,
  type Field,
  type Form,
} from "@/lib/form"
import { cn } from "@/lib/utils"
import { changedLabel, dayLabel } from "@/lib/when"
import type { MemoryRecord } from "@/server/bridge/protocol.ts"

import { CopyId } from "./copy-id"
import { EditorBar } from "./editor-bar"
import { FIELD_IDS } from "./field-ids"
import { MemoryActions } from "./memory-actions"
import { ConflictBand, StatusBand } from "./memory-bands"
import { MemoryFields } from "./memory-fields"
import { useMemoryActions, type Moves } from "./use-memory-actions"
import { useSave, type Rejection } from "./use-save"

type Props = Moves & {
  record: MemoryRecord
  /** A refresh of the memory that failed, shown over the last version read. */
  failure: Error | null
  onRetry: () => void
  onBack: () => void
}

/**
 * One memory to edit. Edits stay in a draft until saved, and the draft remembers the version they
 * began on: when someone else saves the memory first, the person picks whose edits stay.
 */
export function MemoryEditor({
  record,
  failure,
  onRetry,
  onBack,
  ...moves
}: Props) {
  const now = useNow()
  const { id } = record
  const draft = useDraft(id)
  const form = formWith(record, draft)
  const [rejected, setRejected] = useState<Rejection | null>(null)
  const { save, isPending } = useSave(record.namespace, id, {
    onRejected: (rejection) => {
      setRejected(rejection)
      focusField(rejection.field)
    },
    // Save goes away once saved; the keyboard then stays in the memory.
    onSaved: () => requestAnimationFrame(keepFocusInEditor),
  })
  const actions = useMemoryActions(record, moves)
  const problems = problemsOf(draft?.edits ?? {})

  // The draft is read afresh: one event may make several edits, such as a tag added on the way out.
  const change = (patch: Partial<Form>) => {
    setDraft(id, edit(record, readDraft(id), patch))
    if (rejected && rejected.field in patch) setRejected(null)
  }

  // Save is never off while there are edits: a problem sends the keyboard to its field instead.
  const trySave = () => {
    const bad = save()
    if (bad) focusField(bad)
  }

  const discard = () => {
    setDraft(id, undefined)
    setRejected(null)
  }

  // The edits move onto the version on screen and are saved like any other.
  const keepMine = () => {
    setDraft(id, rebase(readDraft(id), record))
    trySave()
  }

  const onSaveKey = useEffectEvent((event: KeyboardEvent) => {
    const modifier = event.metaKey || event.ctrlKey
    if (!modifier || event.altKey || event.key.toLowerCase() !== "s") return
    event.preventDefault()
    // A field that finishes its edit on the way out, such as a tag still being typed, does so first.
    const active = document.activeElement
    if (active instanceof HTMLElement) {
      active.blur()
      active.focus()
    }
    trySave()
  })
  useEffect(() => {
    window.addEventListener("keydown", onSaveKey)
    return () => window.removeEventListener("keydown", onSaveKey)
  }, [])

  return (
    <>
      <EditorBar onBack={onBack}>
        <CopyId
          id={id}
          // On a phone, Discard and Save need the room while there are edits.
          className={cn(draft && "@max-[28.75rem]:hidden")}
        />
        <div className="flex-1" />
        {draft && (
          <>
            <Button variant="ghost" size="sm" onClick={discard}>
              Discard
            </Button>
            <Button
              size="sm"
              title="Save (Ctrl+S / ⌘S)"
              aria-busy={isPending}
              onClick={trySave}
            >
              {isPending && (
                <Loader2Icon className="animate-spin" aria-hidden />
              )}
              Save
            </Button>
            <Separator orientation="vertical" className="mx-1 h-5" />
          </>
        )}
        <MemoryActions record={record} actions={actions} />
      </EditorBar>
      {changedElsewhere(draft, record) && (
        <ConflictBand onLoadLatest={discard} onKeepMine={keepMine} />
      )}
      <StatusBand
        record={record}
        hasExpiry={form.expires !== ""}
        onRemoveExpiry={() => change({ expires: "" })}
        onRestore={actions.restore}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="max-w-3xl px-5 pt-5 pb-10 max-sm:px-4">
          {failure && (
            <Failure error={failure} onRetry={onRetry} className="mb-4" />
          )}
          <MemoryFields
            record={record}
            form={form}
            textEdited={draft?.edits.content !== undefined}
            errorOf={(field) =>
              problems[field] ??
              (rejected?.field === field ? rejected.message : undefined)
            }
            onChange={change}
          />
          <Separator className="mt-6 mb-3" />
          <p className="text-xs text-muted-foreground">
            Version {record.version} · Created{" "}
            {dayLabel(new Date(record.created_at), now)} · Updated{" "}
            {changedLabel(new Date(record.updated_at), now)}
          </p>
        </div>
      </div>
    </>
  )
}

function focusField(field: Field) {
  document.getElementById(FIELD_IDS[field])?.focus()
}

function keepFocusInEditor() {
  const active = document.activeElement
  if (!active || active === document.body) focusField("content")
}
