import type { Page } from "@playwright/test"

/** The parts of Studio's page the scenarios use, found as a person or a screen reader would. */

export function openNamespace(page: Page, name: string) {
  return page.getByRole("button", { name: `${name}, ` }).click()
}

export function heading(page: Page) {
  return page.getByRole("heading", { level: 1 })
}

export function tab(page: Page, name: string) {
  return page.getByRole("tab", { name: new RegExp(`^${name}`) })
}

export function rows(page: Page) {
  return page.getByRole("list", { name: "Memory list" }).getByRole("button")
}

export function memoryPane(page: Page) {
  return page.getByRole("region", { name: "Memory", exact: true })
}

/** The text of the memory open, in its editor. */
export function memoryText(page: Page) {
  return memoryPane(page).getByRole("textbox", { name: "Memory text" })
}
