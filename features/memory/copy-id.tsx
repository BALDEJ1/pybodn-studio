"use client"

import { CheckIcon, CopyIcon } from "lucide-react"
import { useState } from "react"

import { announce } from "@/components/announcer"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const SHORT = 8

/** The start of the memory's id; a click copies all of it. */
export function CopyId({ id, className }: { id: string; className?: string }) {
  const [copied, setCopied] = useState<boolean | null>(null)

  const copy = async () => {
    try {
      // Missing where the browser allows no clipboard, which throws here too.
      await navigator.clipboard.writeText(id)
      setCopied(true)
      announce("Id copied.")
    } catch {
      setCopied(false)
      announce("The browser blocked copying.")
    }
  }

  const short = id.slice(0, SHORT)
  return (
    <Button
      variant="ghost"
      size="xs"
      title={`Copy the full id ${id}`}
      aria-label={
        copied === null
          ? `Copy id ${short}`
          : copied
            ? "Id copied"
            : "Copy blocked by the browser"
      }
      onClick={() => void copy()}
      className={cn("font-mono text-muted-foreground", className)}
    >
      {copied === null ? short : copied ? "Copied" : "Copy blocked"}
      {copied ? <CheckIcon aria-hidden /> : <CopyIcon aria-hidden />}
    </Button>
  )
}
