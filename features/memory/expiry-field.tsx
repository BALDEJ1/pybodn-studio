"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useNow } from "@/hooks/use-now"
import { dateOfDay, dayOfDate } from "@/lib/expiry"
import { dayLabel } from "@/lib/when"

type Props = {
  id: string
  labelId: string
  /** The first day the memory counts as expired; empty for never. */
  day: string
  onChange: (day: string) => void
}

/** The expiry of a memory: a day picked on a calendar, and Clear for none. */
export function ExpiryField({ id, labelId, day, onChange }: Props) {
  const now = useNow()
  const [open, setOpen] = useState(false)
  const date = day === "" ? undefined : dateOfDay(day)

  return (
    <div className="flex min-h-8 items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              id={id}
              variant="ghost"
              size="sm"
              aria-labelledby={`${labelId} ${id}`}
              className="-ml-2.5 font-normal"
            />
          }
        >
          {date ? dayLabel(date, now) : "Never"}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar
            mode="single"
            autoFocus
            selected={date}
            defaultMonth={date}
            onSelect={(picked) => {
              if (picked) onChange(dayOfDate(picked))
              setOpen(false)
            }}
          />
        </PopoverContent>
      </Popover>
      {day !== "" && (
        <Button
          variant="ghost"
          size="xs"
          className="text-muted-foreground"
          onClick={() => onChange("")}
        >
          Clear
        </Button>
      )}
    </div>
  )
}
