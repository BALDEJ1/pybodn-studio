"use client"

import { XIcon } from "lucide-react"
import { useState } from "react"

import { splitTyped, withTags } from "@/lib/tags"

type Props = {
  id: string
  tags: readonly string[]
  onChange: (tags: string[]) => void
  describedBy?: string
}

/**
 * The tags of a memory and a field for more. A comma or Enter finishes a tag, Backspace in the
 * empty field takes off the last one, and leaving the field keeps what was typed.
 */
export function TagField({ id, tags, onChange, describedBy }: Props) {
  const [typed, setTyped] = useState("")

  const add = (text: string, rest = "") => {
    setTyped(rest)
    const next = withTags(tags, text)
    if (next.length !== tags.length) onChange(next)
  }

  return (
    <div className="flex min-h-8 flex-wrap items-center gap-1.5 py-1">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex h-6 max-w-full items-center gap-0.5 rounded-md bg-muted pr-1 pl-2 text-xs font-medium"
        >
          <bdi className="truncate">{tag}</bdi>
          <button
            type="button"
            aria-label={`Remove tag ${tag}`}
            title={`Remove tag ${tag}`}
            onClick={() => onChange(tags.filter((other) => other !== tag))}
            className="grid size-4 shrink-0 place-items-center rounded-sm opacity-60 outline-none hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <XIcon className="size-3" aria-hidden />
          </button>
        </span>
      ))}
      <input
        id={id}
        type="text"
        value={typed}
        placeholder="Add tag"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        aria-describedby={describedBy}
        onChange={(event) => {
          const { value } = event.target
          if (!value.includes(",")) setTyped(value)
          else {
            const { done, rest } = splitTyped(value)
            add(done, rest)
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            add(typed)
          } else if (
            event.key === "Backspace" &&
            typed === "" &&
            tags.length > 0
          ) {
            onChange(tags.slice(0, -1))
          }
        }}
        onBlur={() => {
          if (typed.trim() !== "") add(typed)
        }}
        className="h-6 w-28 rounded-md bg-transparent px-1.5 text-xs outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
      />
    </div>
  )
}
