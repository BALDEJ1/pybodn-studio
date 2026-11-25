"use client"

import { EraserIcon, Loader2Icon } from "lucide-react"

import { ConfirmDialog, type Ask } from "@/components/confirm-dialog"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { useFinalFocus } from "@/hooks/use-final-focus"
import { rescueFocus } from "@/lib/focus"

import { useUpkeep } from "./use-upkeep"

export type Upkeep = "purge" | "erase"

type MenuProps = {
  /** Expired memories in the whole file, once it has been read. */
  expired: number | undefined
  onAsk: (upkeep: Upkeep) => void
}

/** The bottom of the sidebar: work on the whole file rather than one namespace. */
export function UpkeepMenu({ expired, onAsk }: MenuProps) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>File upkeep</SidebarGroupLabel>
      <SidebarMenu>
        <SidebarMenuItem className="flex items-center gap-2 pr-1 pl-2 text-sm">
          <span className="flex-1 text-sidebar-foreground/70">
            Expired memories{" "}
            <span className="tabular-nums">{expired ?? "–"}</span>
          </span>
          <Button
            variant="ghost"
            size="xs"
            aria-label="Delete expired memories"
            disabled={!expired}
            onClick={() => onAsk("purge")}
          >
            Delete
          </Button>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton onClick={() => onAsk("erase")}>
            <EraserIcon aria-hidden />
            <span>Erase deleted data</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  )
}

type DialogsProps = {
  /** The upkeep asking now, if any. */
  asking: Upkeep | null
  expired: number
  onClose: () => void
  onPurged: (gone: ReadonlySet<string>) => void
}

/**
 * What the upkeep asks first, and the window over everything while erasing runs. They live outside
 * the sidebar, which on a phone closes before they open.
 */
export function UpkeepDialogs({
  asking,
  expired,
  onClose,
  onPurged,
}: DialogsProps) {
  const { purge, erase } = useUpkeep(onPurged)
  const finalFocus = useFinalFocus(erase.isPending)
  const asks: Record<Upkeep, Ask> = {
    purge: {
      title: "Delete expired memories?",
      text: `${expired === 1 ? "1 expired memory" : `${expired} expired memories`} will be deleted from every namespace. This cannot be undone.`,
      action: "Delete",
      destructive: true,
      onConfirm: () => purge.mutate(),
    },
    erase: {
      title: "Erase deleted data?",
      text: "Deleted memories leave traces in the file that a program reading it directly can still find. Erasing rewrites the whole file without them. It needs free disk space up to twice the size of the file, and your app's writes wait for it, failing if it outlasts their timeout.",
      action: "Erase",
      destructive: true,
      onConfirm: () => erase.mutate(),
    },
  }

  return (
    <>
      <ConfirmDialog asking={asking} asks={asks} onClose={onClose} />
      {/* Nothing closes it: the file is busy until the rewrite ends. */}
      <AlertDialog
        open={erase.isPending}
        // What asked for it, the dialog before, is gone by then.
        onOpenChangeComplete={(open) => {
          if (!open) rescueFocus()
        }}
      >
        <AlertDialogContent finalFocus={finalFocus}>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Loader2Icon className="size-4 animate-spin" aria-hidden />
              Erasing…
            </AlertDialogTitle>
            <AlertDialogDescription>
              The whole file is being rewritten. Studio and your app wait to
              read or write it until this is done.
            </AlertDialogDescription>
          </AlertDialogHeader>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
