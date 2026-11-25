"use client"

import { useRef } from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useLast } from "@/hooks/use-last"

/** An action that asks first. One that cannot be undone is destructive. */
export type Ask = {
  title: string
  text: string
  action: string
  destructive: boolean
  onConfirm: () => void
}

type Props<K extends string> = {
  /** The action asking now, if any. */
  asking: K | null
  asks: Record<K, Ask>
  onClose: () => void
}

/**
 * The one dialog every action that asks first uses. The keyboard starts on the action when it can
 * be undone, and on Cancel when it cannot.
 */
export function ConfirmDialog<K extends string>({
  asking,
  asks,
  onClose,
}: Props<K>) {
  const shown = useLast(asking)
  const ask = shown === null ? null : asks[shown]
  const actionRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  return (
    <AlertDialog
      open={asking !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <AlertDialogContent
        initialFocus={ask?.destructive ? cancelRef : actionRef}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{ask?.title}</AlertDialogTitle>
          <AlertDialogDescription>{ask?.text}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel ref={cancelRef}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            ref={actionRef}
            variant={ask?.destructive ? "destructive" : "default"}
            onClick={() => {
              onClose()
              ask?.onConfirm()
            }}
          >
            {ask?.action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
