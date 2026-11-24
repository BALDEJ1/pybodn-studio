"use client"

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
  /** Undefined until the file has been read. */
  namespaces: Overview["namespaces"] | undefined
  current: string | null
  onPick: (namespace: string) => void
}

/** The file, its namespaces with their active memories counted, and the theme. */
export function NamespaceSidebar({ path, namespaces, current, onPick }: Props) {
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
              {namespaces === undefined
                ? Array.from({ length: SKELETON_ITEMS }, (_, index) => (
                    <SidebarMenuItem key={index}>
                      <SidebarMenuSkeleton />
                    </SidebarMenuItem>
                  ))
                : namespaces.map(({ name, active }) => (
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
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
