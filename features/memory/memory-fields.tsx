"use client"

import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { Textarea } from "@/components/ui/textarea"
import type { Field, Form } from "@/lib/form"
import type { MemoryRecord } from "@/server/bridge/protocol.ts"

import { ExpiryField } from "./expiry-field"
import { FIELD_IDS } from "./field-ids"
import { TagField } from "./tag-field"

type Props = {
  record: MemoryRecord
  form: Form
  /** The text differs from what is saved, so saving drops its vector. */
  textEdited: boolean
  errorOf: (field: Field) => string | undefined
  onChange: (patch: Partial<Form>) => void
}

const IMPORTANCE_STEP = 0.1

/** The text of a memory and its properties, each with the reason the library would refuse it. */
export function MemoryFields({
  record,
  form,
  textEdited,
  errorOf,
  onChange,
}: Props) {
  const error = (field: Field) => {
    const message = errorOf(field)
    const id = `${FIELD_IDS[field]}-error`
    return {
      invalid: message !== undefined,
      describedBy: message === undefined ? undefined : id,
      shown: message !== undefined && (
        <p id={id} className="mt-1 text-xs text-destructive">
          {message}
        </p>
      ),
    }
  }
  const text = error("content")
  const tags = error("tags")
  const source = error("source")
  const expires = error("expires")
  const importance = error("importance")
  const metadata = error("metadata")

  return (
    <>
      <Textarea
        id={FIELD_IDS.content}
        aria-label="Memory text"
        dir="auto"
        value={form.content}
        aria-invalid={text.invalid}
        aria-describedby={
          [text.describedBy, textEdited ? "memory-text-hint" : undefined]
            .filter(Boolean)
            .join(" ") || undefined
        }
        onChange={(event) => onChange({ content: event.target.value })}
        className="-mx-2.5 -mt-2 min-h-18 w-[calc(100%+1.25rem)] resize-none border-transparent bg-transparent text-base leading-6 shadow-none md:text-base dark:bg-transparent"
      />
      {text.shown}
      {textEdited && (
        <p id="memory-text-hint" className="mt-1 text-xs text-muted-foreground">
          Saving drops this memory&apos;s vector for search by meaning. Your app
          adds it back with embed_missing().
        </p>
      )}

      <div className="mt-5 grid grid-cols-[7rem_minmax(0,1fr)] items-start gap-x-4 gap-y-1 text-sm max-sm:grid-cols-1 max-sm:gap-y-0">
        {record.key !== null && (
          <>
            <Label>Key</Label>
            <div className="flex min-h-8 items-center">
              <bdi
                className="font-mono text-[0.8125rem] wrap-anywhere"
                title="Set when the memory was added. It cannot be changed."
              >
                {record.key}
              </bdi>
            </div>
          </>
        )}

        <Label htmlFor={FIELD_IDS.tags}>Tags</Label>
        <div>
          <TagField
            id={FIELD_IDS.tags}
            tags={form.tags}
            describedBy={tags.describedBy}
            onChange={(next) => onChange({ tags: next })}
          />
          {tags.shown}
        </div>

        <Label>Importance</Label>
        <div>
          <div className="flex min-h-8 items-center gap-3">
            <Slider
              id={FIELD_IDS.importance}
              thumbLabel="Importance"
              min={0}
              max={1}
              step={IMPORTANCE_STEP}
              value={form.importance}
              onValueChange={(value) =>
                onChange({
                  importance: Array.isArray(value) ? value[0] : value,
                })
              }
              className="max-w-60"
            />
            <span className="w-8 text-right font-mono text-xs text-muted-foreground tabular-nums">
              {Number(form.importance.toFixed(2))}
            </span>
          </div>
          {importance.shown}
        </div>

        <Label htmlFor={FIELD_IDS.source}>Source</Label>
        <div>
          <Input
            id={FIELD_IDS.source}
            dir="auto"
            value={form.source}
            placeholder="None"
            autoCapitalize="off"
            autoCorrect="off"
            aria-invalid={source.invalid}
            aria-describedby={source.describedBy}
            onChange={(event) => onChange({ source: event.target.value })}
            className="-ml-2.5 w-[calc(100%+0.625rem)] border-transparent bg-transparent shadow-none hover:border-input dark:bg-transparent"
          />
          {source.shown}
        </div>

        <Label id="memory-expires-label">Expires</Label>
        <div>
          <ExpiryField
            id={FIELD_IDS.expires}
            labelId="memory-expires-label"
            day={form.expires}
            onChange={(day) => onChange({ expires: day })}
          />
          {expires.shown}
        </div>

        <Label htmlFor={FIELD_IDS.metadata}>Metadata</Label>
        <div className="py-1">
          <Textarea
            id={FIELD_IDS.metadata}
            value={form.metadata}
            spellCheck={false}
            aria-invalid={metadata.invalid}
            aria-describedby={metadata.describedBy}
            onChange={(event) => onChange({ metadata: event.target.value })}
            className="min-h-18 resize-y bg-muted font-mono text-xs leading-[1.125rem] md:text-xs"
          />
          {metadata.shown}
        </div>
      </div>
    </>
  )
}

function Label({
  htmlFor,
  id,
  children,
}: {
  htmlFor?: string
  id?: string
  children: React.ReactNode
}) {
  const className = "py-1.5 text-muted-foreground max-sm:pt-3 max-sm:pb-0.5"
  return htmlFor ? (
    <label htmlFor={htmlFor} className={className}>
      {children}
    </label>
  ) : (
    <span id={id} className={className}>
      {children}
    </span>
  )
}
