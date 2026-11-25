"use client"

import { Toast } from "@base-ui/react/toast"
import { XIcon } from "lucide-react"

import { buttonVariants } from "@/components/ui/button"
import { rescueFocus } from "@/lib/focus"
import { cn } from "@/lib/utils"

const SHOWN_FOR = 8_000

// One manager for the whole page, so a toast can be asked for from outside a component, such as
// when a save finishes.
const manager = Toast.createToastManager()

type Action = { label: string; onClick: () => void }

/**
 * A short message at the bottom of the page, with one action such as "Undo". It goes away after 8
 * seconds, but not while the pointer or the keyboard is on it, and screen readers read it out.
 */
export function notify(text: string, action?: Action): void {
  const id = manager.add({
    title: text,
    // Undo may have been the last thing the keyboard was on.
    onRemove: rescueFocus,
    actionProps: action && {
      children: action.label,
      onClick: () => {
        manager.close(id)
        action.onClick()
      },
    },
  })
}

/** Where the toasts show: one at a time, a new one in place of the last. */
export function Toaster() {
  return (
    <Toast.Provider toastManager={manager} timeout={SHOWN_FOR} limit={1}>
      <Toast.Portal>
        <Toast.Viewport className="fixed inset-x-4 bottom-4 z-50 mx-auto w-fit max-w-md">
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  )
}

function ToastList() {
  const { toasts } = Toast.useToastManager()
  return toasts.map((toast) => (
    <Toast.Root
      key={toast.id}
      toast={toast}
      className="transition-[opacity,translate] duration-200 data-ending-style:opacity-0 data-limited:hidden data-starting-style:translate-y-2 data-starting-style:opacity-0"
    >
      <Toast.Content className="flex min-h-12 items-center gap-2 rounded-lg border bg-popover py-1.5 pr-1.5 pl-4 text-sm text-popover-foreground shadow-lg">
        <Toast.Title
          render={<p />}
          className="min-w-0 flex-1 font-normal wrap-anywhere"
        />
        <Toast.Action
          className={buttonVariants({ variant: "outline", size: "xs" })}
        />
        <Toast.Close
          aria-label="Dismiss"
          title="Dismiss"
          className={cn(
            buttonVariants({ variant: "ghost", size: "icon-sm" }),
            "text-muted-foreground"
          )}
        >
          <XIcon />
        </Toast.Close>
      </Toast.Content>
    </Toast.Root>
  ))
}
