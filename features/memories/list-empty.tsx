import {
  ArchiveIcon,
  ClockIcon,
  DatabaseIcon,
  InboxIcon,
  SearchIcon,
  type LucideIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import type { Go } from "@/hooks/use-place"
import { toView, type Place } from "@/lib/place"
import { VIEWS, type View } from "@/server/bridge/protocol.ts"

import { focusSearch } from "./search-box"
import type { Counts } from "./use-rows"
import { VIEW_NAMES } from "./view-names"

type Said = { icon: LucideIcon; title: string; text: string }

const QUIET: Record<View, Said> = {
  active: {
    icon: InboxIcon,
    title: "No memories here",
    text: "New memories in this namespace show up here.",
  },
  archived: {
    icon: ArchiveIcon,
    title: "Nothing archived",
    text: "Archived memories show up here.",
  },
  expired: {
    icon: ClockIcon,
    title: "Nothing expired",
    text: "Memories past their expiry date show up here.",
  },
}

type Props = {
  place: Place
  go: Go
  searching: boolean
  counts: Counts | undefined
}

/** What a tab with no rows says, and the way out of it. */
export function ListEmpty({ place, go, searching, counts }: Props) {
  if (place.namespace === null) {
    return (
      <Shown
        icon={DatabaseIcon}
        title="No namespaces yet"
        text="A namespace is created with its first memory."
      />
    )
  }
  if (!searching) return <Shown {...QUIET[place.view]} />

  const other = VIEWS.find((view) => view !== place.view && counts?.[view])
  // Both buttons go away with this empty state, so the keyboard moves on to the search.
  const searchIn = (next: Place) => {
    go(next)
    focusSearch()
  }
  return (
    <Shown
      icon={SearchIcon}
      title={`No matches in ${VIEW_NAMES[place.view]}`}
      text={
        other && counts
          ? `${counts[other]} under ${VIEW_NAMES[other]}.`
          : "Try other words."
      }
    >
      {other && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => searchIn(toView(place, other))}
        >
          Show {VIEW_NAMES[other]}
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => searchIn({ ...place, query: "" })}
      >
        Clear search
      </Button>
    </Shown>
  )
}

function Shown({
  icon: Icon,
  title,
  text,
  children,
}: Said & { children?: React.ReactNode }) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{text}</EmptyDescription>
      </EmptyHeader>
      {children && (
        <EmptyContent className="flex-row justify-center">
          {children}
        </EmptyContent>
      )}
    </Empty>
  )
}
