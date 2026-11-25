"use client"

import { PlusIcon } from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  useSidebar,
} from "@/components/ui/sidebar"
import type { Overview } from "@/server/bridge/protocol.ts"

import { ThemeSwitch } from "./theme-switch"

const SKELETON_ITEMS = 4

type Props = {
  path: string
  /** Undefined until the file has been read, or when it could not be. */
  namespaces: Overview["namespaces"] | undefined
  /** Grey placeholders stand in while the first read is on its way. */
  loading: boolean
  current: string | null
  onPick: (namespace: string) => void
  onNewNamespace: () => void
}

/** The file, its namespaces with their active memories counted, and the theme. */
export function NamespaceSidebar({
  path,
  namespaces,
  loading,
  current,
  onPick,
  onNewNamespace,
}: Props) {
  const { setOpenMobile } = useSidebar()
  return (
    <Sidebar>
      <SidebarHeader className="flex-row items-center gap-2">
        <div className="min-w-0 flex-1 px-2">
          <p className="text-sm font-semibold">PyBodn Studio</p>
          <p
            title={path}
            className="truncate font-mono text-xs text-muted-foreground"
          >
            {path}
          </p>
        </div>
        <ThemeSwitch />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Namespaces</SidebarGroupLabel>
          <nav aria-label="Namespaces">
            <SidebarMenu>
              {loading
                ? Array.from({ length: SKELETON_ITEMS }, (_, index) => (
                    <SidebarMenuItem key={index}>
                      <SidebarMenuSkeleton />
                    </SidebarMenuItem>
                  ))
                : namespaces?.map(({ name, active }) => (
                    <SidebarMenuItem key={name}>
                      <SidebarMenuButton
                        isActive={name === current}
                        aria-current={name === current ? "page" : undefined}
                        aria-label={`${name}, ${active} active`}
                        title={name}
                        onClick={() => {
                          onPick(name)
                          setOpenMobile(false)
                        }}
                      >
                        <span dir="auto">{name}</span>
                      </SidebarMenuButton>
                      <SidebarMenuBadge aria-hidden>{active}</SidebarMenuBadge>
                    </SidebarMenuItem>
                  ))}
            </SidebarMenu>
          </nav>
          {/* An action rather than a place, so it stands apart from the namespaces to go to. */}
          {!loading && namespaces && (
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  className="text-muted-foreground"
                  onClick={() => {
                    // The sheet on a phone makes way for the dialog.
                    setOpenMobile(false)
                    onNewNamespace()
                  }}
                >
                  <PlusIcon aria-hidden />
                  <span>New namespace</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          )}
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
