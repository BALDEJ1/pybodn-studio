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

test("archiving a memory with unsaved edits, then Undo: the memory is back with its edits, which still save", async ({
  page,
}) => {
  await page.goto(studio.link)
  await openNamespace(page, "user:alice")
  await rows(page).filter({ hasText: "Works from home on Fridays" }).click()
  await memoryText(page).fill("Works from home on Fridays and Mondays")

  await memoryPane(page).getByRole("button", { name: "Archive" }).click()
  const dialog = asking(page, "Archive this memory?")
  // Archive can be undone, so the keyboard starts on it.
  await expect(dialog.getByRole("button", { name: "Archive" })).toBeFocused()
  await dialog.getByRole("button", { name: "Archive" }).click()

  await expect(
    page.getByRole("button", { name: "user:alice, 7 active" })
  ).toBeVisible()
  await expect(rows(page).filter({ hasText: "Works from home" })).toHaveCount(0)
  await page.getByRole("button", { name: "Undo" }).click()

  await expect(memoryText(page)).toHaveValue(
    "Works from home on Fridays and Mondays"
  )
  await expect(
    page.getByRole("button", { name: "user:alice, 8 active" })
  ).toBeVisible()
  // The page's own archive and restore are not someone else's change.
  await expect(memoryPane(page).getByRole("alert")).toHaveCount(0)
  await memoryPane(page).getByRole("button", { name: "Save" }).click()
  await expect(
    memoryPane(page).getByRole("button", { name: "Save" })
  ).toBeHidden()

  await page.reload()
  await expect(memoryText(page)).toHaveValue(
    "Works from home on Fridays and Mondays"
  )
})

test("restoring an archived memory moves it to Active at once", async ({
  page,
}) => {
  await page.goto(studio.link)
  await openNamespace(page, "user:alice")
  await tab(page, "Archived").click()
  await rows(page).filter({ hasText: "Planning a trip to Lisbon" }).click()

  await memoryPane(page).getByRole("button", { name: "Restore" }).click()

  await expect(rows(page)).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: "user:alice, 9 active" })
  ).toBeVisible()
  await tab(page, "Active").click()
  await expect(
    rows(page).filter({ hasText: "Planning a trip to Lisbon" })
  ).toHaveCount(1)
})

test("deleting a memory asks first, then the next memory takes its place", async ({
  page,
}) => {
  await page.goto(studio.link)
  await openNamespace(page, "user:bob")
  await rows(page).filter({ hasText: "Runs a small bakery in Lyon" }).click()

  await memoryPane(page).getByRole("button", { name: "Delete" }).click()
  const dialog = asking(page, "Delete this memory?")
  // Deleting cannot be undone, so the keyboard starts on Cancel.
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused()
  await dialog.getByRole("button", { name: "Delete" }).click()

  await expect(
    page.getByRole("button", { name: "user:bob, 2 active" })
  ).toBeVisible()
  await expect(rows(page)).toHaveCount(2)
  await expect(memoryText(page)).not.toHaveValue("Runs a small bakery in Lyon")
  await expect(memoryText(page)).toBeVisible()

  await page.reload()
  await expect(rows(page).filter({ hasText: "bakery" })).toHaveCount(0)
})

test("deleting the last memory of a namespace says the namespace goes too, and another namespace opens", async ({
  page,
}) => {
  addElsewhere(db, "team:research", { content: "Meets on Mondays at ten" })
  await page.goto(studio.link)
  await openNamespace(page, "team:research")
  await expect(memoryText(page)).toHaveValue("Meets on Mondays at ten")

  await memoryPane(page).getByRole("button", { name: "Delete" }).click()
  const dialog = asking(page, "Delete this memory?")
  await expect(dialog).toContainText("team:research goes too")
  await dialog.getByRole("button", { name: "Delete" }).click()

  await expect(
    page.getByRole("button", { name: /^team:research, / })
  ).toHaveCount(0)
  await expect(heading(page)).not.toHaveText("team:research")
  await expect(memoryText(page)).toBeVisible()
})

test("deleting the expired memories of the file leaves the one open, which was among them", async ({
  page,
}) => {
  await page.goto(studio.link)
  await openNamespace(page, "agent:planner")
  await tab(page, "Expired").click()
  await rows(page).filter({ hasText: "Pickup for the team offsite" }).click()
  await expect(memoryText(page)).toBeVisible()

  await page.getByRole("button", { name: "Delete expired memories" }).click()
  await asking(page, "Delete expired memories?")
    .getByRole("button", { name: "Delete" })
    .click()

  await expect(page.getByText("1 expired memory deleted.")).toBeVisible()
  await expect(rows(page)).toHaveCount(0)
  await expect.poll(() => new URL(page.url()).searchParams.get("id")).toBeNull()
  await expect(
    page.getByRole("button", { name: "Delete expired memories" })
  ).toBeDisabled()
})

test("after erasing deleted data the page follows changes made elsewhere again", async ({
  page,
}) => {
  await page.goto(studio.link)
  await openNamespace(page, "user:bob")

  await page.getByRole("button", { name: "Erase deleted data" }).click()
  await asking(page, "Erase deleted data?")
    .getByRole("button", { name: "Erase" })
    .click()

  await expect(
    page.getByText("Deleted data erased from the file.")
  ).toBeVisible()
  await expect(page.getByRole("alertdialog")).toHaveCount(0)
  // The reads every few seconds were paused while the file was rewritten.
  addElsewhere(db, "user:bob", { content: "Closes the bakery in August" })
  await expect(
    page.getByRole("button", { name: "user:bob, 4 active" })
  ).toBeVisible()
})

function asking(page: Page, title: string) {
  return page.getByRole("alertdialog", { name: title })
}
