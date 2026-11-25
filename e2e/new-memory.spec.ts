import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import { expect, test, type Page } from "@playwright/test"

import {
  heading,
  memoryPane,
  memoryText,
  openNamespace,
  rows,
  tab,
} from "./pages"
import { addElsewhere, seed, startStudio, type Studio } from "./studio"

let folder: string
let db: string
let studio: Studio

test.beforeEach(async () => {
  folder = mkdtempSync(path.join(tmpdir(), "pybodn-studio-"))
  db = path.join(folder, "memory.db")
  seed(db)
  studio = await startStudio(db)
})

test.afterEach(async () => {
  await studio.stop()
  rmSync(folder, { recursive: true, force: true })
})

test("a namespace is created with its first memory, a tag still being typed included, and the memory opens", async ({
  page,
}) => {
  await page.goto(studio.link)
  await page.getByRole("button", { name: "New namespace" }).click()
  const dialog = page.getByRole("dialog", { name: "New namespace" })
  await expect(field(dialog, "Namespace")).toBeFocused()
  await field(dialog, "Namespace").fill("team:research")
  await field(dialog, "Memory").fill("Meets on Mondays at ten")
  await field(dialog, "Key").fill("meeting-day")
  // Nothing finishes this tag: leaving the field for the button keeps it.
  await field(dialog, "Tags").fill("meetings")
  await dialog.getByRole("button", { name: "Create namespace" }).click()

  await expect(dialog).toBeHidden()
  await expect(heading(page)).toHaveText("team:research")
  await expect(
    page.getByRole("button", { name: "team:research, 1 active" })
  ).toBeVisible()
  await expect(memoryText(page)).toHaveValue("Meets on Mondays at ten")

  await page.reload()
  await expect(memoryText(page)).toHaveValue("Meets on Mondays at ten")
  await expect(
    memoryPane(page).getByRole("button", { name: "Remove tag meetings" })
  ).toBeVisible()
  await expect(memoryPane(page).getByText("meeting-day")).toBeVisible()
})

test("a key an archived memory holds: the dialog shows that memory, and replacing it brings it back to Active with the new text", async ({
  page,
}) => {
  await page.goto(studio.link)
  await openNamespace(page, "user:alice")
  await tab(page, "Archived").click()
  await rows(page).filter({ hasText: "Planning a trip to Lisbon" }).click()
  const id = new URL(page.url()).searchParams.get("id")
  // Unsaved edits made on the old text go with it.
  await memoryText(page).fill("Planning a trip to Lisbon in November")

  await page.getByRole("button", { name: "New memory" }).click()
  const dialog = page.getByRole("dialog", { name: "New memory" })
  await expect(field(dialog, "Namespace")).toHaveValue("user:alice")
  await field(dialog, "Memory").fill("Planning a trip to Kyoto in March")
  await field(dialog, "Key").fill("next-trip")
  await expect(
    dialog.getByText("Planning a trip to Lisbon in October")
  ).toBeVisible()
  await dialog.getByRole("button", { name: "Replace memory" }).click()

  await expect(dialog).toBeHidden()
  await expect(tab(page, "Active")).toHaveAttribute("aria-selected", "true")
  await expect(memoryText(page)).toHaveValue(
    "Planning a trip to Kyoto in March"
  )
  await expect(memoryPane(page).getByRole("alert")).toHaveCount(0)
  await expect(
    memoryPane(page).getByRole("button", { name: "Save", exact: true })
  ).toBeHidden()
  // The same memory, not a new one beside it.
  expect(new URL(page.url()).searchParams.get("id")).toBe(id)
  await tab(page, "Archived").click()
  await expect(rows(page)).toHaveCount(0)
})

test("a key another program takes while the dialog is open: adding is refused, and the dialog shows the memory that took it", async ({
  page,
}) => {
  await page.goto(studio.link)
  await openNamespace(page, "user:bob")
  await page.getByRole("button", { name: "New memory" }).click()
  const dialog = page.getByRole("dialog", { name: "New memory" })
  await field(dialog, "Memory").fill("Prefers calls to emails")
  await field(dialog, "Key").fill("contact-way")
  const add = dialog.getByRole("button", { name: "Add memory" })
  await expect(add).toBeEnabled()

  addElsewhere(db, "user:bob", {
    content: "Prefers chat to calls",
    key: "contact-way",
  })
  await add.click()

  await expect(field(dialog, "Key")).toBeFocused()
  await expect(dialog.getByText("Prefers chat to calls")).toBeVisible()
  await dialog.getByRole("button", { name: "Replace memory" }).click()
  await expect(dialog).toBeHidden()
  await expect(memoryText(page)).toHaveValue("Prefers calls to emails")
  // Three memories before, the one the other program added, and no fifth beside it.
  await expect(
    page.getByRole("button", { name: "user:bob, 4 active" })
  ).toBeVisible()
})

function field(dialog: ReturnType<Page["getByRole"]>, name: string) {
  return dialog.getByLabel(name, { exact: true })
}
