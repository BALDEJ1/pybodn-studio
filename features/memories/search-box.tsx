import { SearchIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { focusSearch, focusTabStop, SEARCH_ID } from "@/lib/focus"

type Props = {
  query: string
  /** Typing replaces the address as it goes; clearing is a step of its own. */
  onChange: (query: string, typing: boolean) => void
}

/** Escape clears the search first; the down arrow goes on to the list. */
export function SearchBox({ query, onChange }: Props) {
  return (
    <div className="relative shrink-0 border-b p-2">
      <SearchIcon
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-4.5 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        id={SEARCH_ID}
        type="search"
        aria-label="Search memories"
        placeholder="Search"
        autoComplete="off"
        value={query}
        onChange={(event) => onChange(event.target.value, true)}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return
          if (event.key === "Escape" && query !== "") {
            event.preventDefault()
            onChange("", false)
          } else if (event.key === "ArrowDown") {
            event.preventDefault()
            focusTabStop()
          }
        }}
        className="px-8 [&::-webkit-search-cancel-button]:hidden"
      />
      {query !== "" && (
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Clear search"
          title="Clear search"
          onClick={() => {
            onChange("", false)
            focusSearch() // the button itself goes away
          }}
          className="absolute top-1/2 right-3.5 -translate-y-1/2 text-muted-foreground"
        >
          <XIcon />
        </Button>
      )}
    </div>
  )
}
