"use client"

import { useQuery } from "@tanstack/react-query"
import { Loader2Icon } from "lucide-react"
import { useRef, useState, type FormEvent, type RefObject } from "react"

import { FieldError, fieldAria } from "@/components/field-error"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ApiError } from "@/lib/api"
import {
  failureOf,
  isReady,
  keyToCheck,
  outcomeOf,
  requestOf,
  type Failure,
  type NewField,
  type NewMemory,
  type Outcome,
} from "@/lib/new-memory"
import { keyOwnerQuery } from "@/lib/queries"
import { VIEW_NAMES } from "@/lib/view-names"
import type { MemoryRecord } from "@/server/bridge/protocol.ts"

import { TagField } from "../memory/tag-field"
import { useAdd } from "./use-add"

/** "namespace" starts with no namespace and the keyboard in that field. */
export type Opening = "memory" | "namespace"

type Props = {
  /** The dialog open, if any. */
  opening: Opening | null
  namespaces: readonly string[]
  /** The namespace open, where a new memory goes unless another is typed. */
  current: string | null
  onClose: () => void
  onAdded: (record: MemoryRecord) => void
}

const IDS: Record<NewField, string> = {
  namespace: "new-memory-namespace",
  content: "new-memory-text",
  tags: "new-memory-tags",
  key: "new-memory-key",
}
const NAMESPACE_HINT = "new-memory-namespace-hint"
const KEY_HINT = "new-memory-key-hint"
const NAMESPACE_OPTIONS = "new-memory-namespaces"

const ACTIONS: Record<Outcome, string> = {
  add: "Add memory",
  create: "Create namespace",
  replace: "Replace memory",
}

/** A new memory, which creates its namespace when that is new, or replaces the memory with its key. */
export function NewMemoryDialog({ opening, onClose, onAdded, ...rest }: Props) {
  // The words stay while the dialog fades out.
  const [shown, setShown] = useState<Opening>("memory")
  if (opening !== null && opening !== shown) setShown(opening)
  const namespaceRef = useRef<HTMLInputElement>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const add = useAdd(onAdded)

  return (
    <Dialog
      open={opening !== null}
      onOpenChange={(open) => {
        // It stays open until the memory is added or refused, so the answer is never missed.
        if (!open && !add.isPending) onClose()
      }}
    >
      <DialogContent
        initialFocus={shown === "namespace" ? namespaceRef : textRef}
        className="sm:max-w-md"
      >
        <NewMemoryForm
          opening={shown}
          namespaceRef={namespaceRef}
          textRef={textRef}
          add={add}
          {...rest}
        />
      </DialogContent>
    </Dialog>
  )
}

type FormProps = Omit<Props, "opening" | "onClose" | "onAdded"> & {
  opening: Opening
  add: ReturnType<typeof useAdd>
  namespaceRef: RefObject<HTMLInputElement | null>
  textRef: RefObject<HTMLTextAreaElement | null>
}

function NewMemoryForm({
  opening,
  namespaces,
  current,
  add,
  namespaceRef,
  textRef,
}: FormProps) {
  const [memory, setMemory] = useState<NewMemory>({
    namespace: opening === "memory" ? (current ?? "") : "",
    content: "",
    tags: [],
    key: "",
  })
  const [failure, setFailure] = useState<Failure | null>(null)
  const checked = keyToCheck(memory, namespaces)
  const lookup = useQuery({
    ...keyOwnerQuery(checked?.namespace ?? "", checked?.key ?? ""),
    enabled: checked !== null,
  })
  const owner = checked ? (lookup.data ?? null) : null
  const outcome = outcomeOf(memory, namespaces, owner)
  const ready = isReady(memory) && !lookup.isLoading && !add.isPending

  const change = (patch: Partial<NewMemory>) => {
    setMemory((before) => ({ ...before, ...patch }))
    setFailure(null)
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!ready) return
    add.mutate(
      { request: requestOf(memory, outcome), outcome },
      {
        onError: (error) => {
          const code = error instanceof ApiError ? error.code : null
          // Someone gave the key to a memory meanwhile: the dialog shows it, to replace or not.
          if (code === "duplicate_key") void lookup.refetch()
          const failed = failureOf(code, error.message)
          setFailure(failed)
          // The keyboard goes to the field refused, which then reads out why.
          const { field } = failed
          if (field) {
            requestAnimationFrame(() =>
              document.getElementById(IDS[field])?.focus()
            )
          }
        },
      }
    )
  }

  const reason = (field: NewField) =>
    failure?.field === field ? failure.message : undefined
  const aria = (field: NewField, hint?: string | false) =>
    fieldAria(reason(field) === undefined ? null : `${IDS[field]}-error`, hint)
  const error = (field: NewField) => (
    <FieldError id={`${IDS[field]}-error`} message={reason(field)} />
  )
  const creates = outcome === "create" && memory.namespace.trim() !== ""

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle>
          {opening === "namespace" ? "New namespace" : "New memory"}
        </DialogTitle>
      </DialogHeader>
      {failure && failure.field === null && (
        <Alert variant="destructive">
          <AlertDescription>{failure.message}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-1.5">
        <Label htmlFor={IDS.namespace}>Namespace</Label>
        <Input
          ref={namespaceRef}
          id={IDS.namespace}
          list={NAMESPACE_OPTIONS}
          value={memory.namespace}
          placeholder="user:carol"
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          className="font-mono"
          {...aria("namespace", creates && NAMESPACE_HINT)}
          onChange={(event) => change({ namespace: event.target.value })}
        />
        <datalist id={NAMESPACE_OPTIONS}>
          {namespaces.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        {creates && (
          <Hint id={NAMESPACE_HINT}>
            New namespace. It is created with this memory and goes away with its
            last one.
          </Hint>
        )}
        {error("namespace")}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor={IDS.content}>Memory</Label>
        <Textarea
          ref={textRef}
          id={IDS.content}
          dir="auto"
          rows={3}
          value={memory.content}
          {...aria("content")}
          onChange={(event) => change({ content: event.target.value })}
        />
        {error("content")}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor={IDS.tags}>Tags</Label>
        {/* Leaving the field keeps a tag still being typed, so Add takes it too. */}
        <div className="rounded-md border border-input px-1.5 focus-within:ring-3 focus-within:ring-ring/50">
          <TagField
            id={IDS.tags}
            tags={memory.tags}
            {...aria("tags")}
            onChange={(tags) => change({ tags })}
          />
        </div>
        {error("tags")}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor={IDS.key}>Key</Label>
        <Input
          id={IDS.key}
          value={memory.key}
          placeholder="Optional"
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          className="font-mono"
          {...aria("key", KEY_HINT)}
          onChange={(event) => change({ key: event.target.value })}
        />
        {owner ? (
          <KeyOwner id={KEY_HINT} owner={owner} />
        ) : (
          <Hint id={KEY_HINT}>A key cannot be changed later.</Hint>
        )}
        {error("key")}
      </div>

      <DialogFooter>
        <DialogClose
          render={<Button variant="outline" disabled={add.isPending} />}
        >
          Cancel
        </DialogClose>
        <Button type="submit" disabled={!ready} aria-busy={add.isPending}>
          {add.isPending && (
            <Loader2Icon className="animate-spin" aria-hidden />
          )}
          {ACTIONS[outcome]}
        </Button>
      </DialogFooter>
    </form>
  )
}

/** The memory a new one with this key replaces, and what replacing it resets. */
function KeyOwner({ id, owner }: { id: string; owner: MemoryRecord }) {
  return (
    <div id={id} className="grid gap-1 text-xs text-destructive">
      <p>
        This key belongs to{" "}
        <q dir="auto" className="font-medium">
          {owner.content}
        </q>
      </p>
      <p>
        Replacing it resets its importance, source, expiry and metadata.
        {owner.status !== "active" &&
          ` It moves from ${VIEW_NAMES[owner.status]} to Active.`}
      </p>
    </div>
  )
}

function Label({
  htmlFor,
  children,
}: {
  htmlFor: string
  children: React.ReactNode
}) {
  return (
    <label htmlFor={htmlFor} className="text-sm font-medium">
      {children}
    </label>
  )
}

function Hint({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p id={id} className="text-xs text-muted-foreground">
      {children}
    </p>
  )
}
