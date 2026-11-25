import { ArrowLeftIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type Props = {
  onBack: () => void
  children?: React.ReactNode
  className?: string
}

/** The bar over a memory: Back to the list below 1024 px, then the memory's own buttons. */
export function EditorBar({ onBack, children, className }: Props) {
  return (
    <div
      className={cn(
        "flex h-13 shrink-0 items-center gap-2 border-b px-3 @max-[28.75rem]:gap-1 @max-[28.75rem]:px-2",
        className
      )}
    >
      <Button
        variant="ghost"
        size="icon"
        aria-label="Back to memories"
        title="Back to memories"
        onClick={onBack}
        className="lg:hidden"
      >
        <ArrowLeftIcon />
      </Button>
      {children}
    </div>
  )
}
