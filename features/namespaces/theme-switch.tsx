"use client"

import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"

// Each press moves on to the next theme.
const THEMES = {
  system: { name: "System", icon: MonitorIcon, next: "light" },
  light: { name: "Light", icon: SunIcon, next: "dark" },
  dark: { name: "Dark", icon: MoonIcon, next: "system" },
} as const

/** Light, dark, or as the system has it. */
export function ThemeSwitch() {
  const { theme, setTheme } = useTheme()
  const current = theme === "light" || theme === "dark" ? theme : "system"
  const { name, icon: Icon, next } = THEMES[current]
  const label = `Theme: ${name}. Switch to ${THEMES[next].name}`
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      onClick={() => setTheme(next)}
    >
      <Icon />
    </Button>
  )
}
