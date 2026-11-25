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
import {
  addElsewhere,
  changeElsewhere,
  seed,
  startStudio,
  type Studio,
} from "./studio"

const PHONE = { width: 375, height: 812 }

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

test("edits someone else's save had passed are still theirs to settle after archive and Undo", async ({
  page,
}) => {
  await page.goto(studio.link)
  await openNamespace(page, "user:alice")
  await rows(page).filter({ hasText: "Has a dog named Miso" }).click()
  const id = new URL(page.url()).searchParams.get("id") ?? ""
  await memoryText(page).fill("Has a dog named Miso and a cat")
  changeElsewhere(db, "user:alice", id, { source: "email" })
  const conflict = memoryPane(page).getByRole("alert")
  await expect(conflict).toContainText("Changed elsewhere")

  await memoryPane(page).getByRole("button", { name: "Archive" }).click()
  await asking(page, "Archive this memory?")
    .getByRole("button", { name: "Archive" })
    .click()
  await page.getByRole("button", { name: "Undo" }).click()

  await expect(memoryText(page)).toHaveValue("Has a dog named Miso and a cat")
  await expect(conflict).toContainText("Changed elsewhere")
})

test("a delete that ends after the person opened another memory leaves them on that one", async ({
  page,
}) => {
  let release = () => {}
  const held = new Promise<void>((resolve) => (release = resolve))
  await page.route("**/api/memory", async (route) => {
    if (route.request().postDataJSON()?.method === "delete") await held
    await route.continue()
  })
  await page.goto(studio.link)
  await openNamespace(page, "user:alice")
  await rows(page).first().click()
  await memoryPane(page).getByRole("button", { name: "Delete" }).click()
  await asking(page, "Delete this memory?")
    .getByRole("button", { name: "Delete" })
    .click()

  // Not the next one, which the delete would open.
  const picked = await rows(page).last().textContent()
  await rows(page).last().click()
  const id = new URL(page.url()).searchParams.get("id")
  release()

  await expect(page.getByText("Memory deleted.")).toBeVisible()
  expect(new URL(page.url()).searchParams.get("id")).toBe(id)
  expect(picked).toContain(await memoryText(page).inputValue())
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
  await rows(page).nth(2).click()
  const next = await memoryText(page).inputValue()
  await rows(page).nth(1).click()
  await expect(memoryText(page)).not.toHaveValue(next)
  const deleted = await memoryText(page).inputValue()

  await memoryPane(page).getByRole("button", { name: "Delete" }).click()
  const dialog = asking(page, "Delete this memory?")
  // Deleting cannot be undone, so the keyboard starts on Cancel.
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused()
  await dialog.getByRole("button", { name: "Delete" }).click()

  await expect(
    page.getByRole("button", { name: "user:bob, 2 active" })
  ).toBeVisible()
  await expect(memoryText(page)).toHaveValue(next)

  await page.reload()
  await expect(rows(page)).toHaveCount(2)
  await expect(rows(page).filter({ hasText: deleted })).toHaveCount(0)
})

test("on a phone, a deleted memory gives way to its list, and the sidebar's upkeep asks once the sidebar closes", async ({
  page,
}) => {
  await page.setViewportSize(PHONE)
  await page.goto(studio.link)
  await page.getByRole("button", { name: "Open namespaces" }).click()
  await openNamespace(page, "user:bob")
  await rows(page).first().click()

  await memoryPane(page).getByRole("button", { name: "Delete" }).click()
  await asking(page, "Delete this memory?")
    .getByRole("button", { name: "Delete" })
    .click()

  await expect(rows(page)).toHaveCount(2)
  await expect(heading(page)).toHaveText("user:bob")
  expect(new URL(page.url()).searchParams.has("id")).toBe(false)

  await page.getByRole("button", { name: "Open namespaces" }).click()
  await page.getByRole("button", { name: "Delete expired memories" }).click()
  await expect(asking(page, "Delete expired memories?")).toBeVisible()
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

test("deleting the expired memories, when it ends after the person opened another memory, leaves them on that one", async ({
  page,
}) => {
  let release = () => {}
  const held = new Promise<void>((resolve) => (release = resolve))
  let purged = false
  // The file has no expired memories left, but the page has not yet read that back.
  await page.route("**/api/memory", async (route) => {
    const { method } = route.request().postDataJSON() as { method: string }
    if (purged && method === "overview") await held
    const response = await route.fetch()
    if (method === "purge_expired") purged = true
    await route.fulfill({ response })
  })
  await page.goto(studio.link)
  await openNamespace(page, "agent:planner")
  await tab(page, "Expired").click()
  await rows(page).filter({ hasText: "Pickup for the team offsite" }).click()
  await page.getByRole("button", { name: "Delete expired memories" }).click()
  await asking(page, "Delete expired memories?")
    .getByRole("button", { name: "Delete" })
    .click()

  await expect.poll(() => purged).toBe(true)
  await tab(page, "Active").click()
  await rows(page).filter({ hasText: "Deploys go out on Tuesdays" }).click()
  const id = new URL(page.url()).searchParams.get("id")
  release()

  await expect(page.getByText("1 expired memory deleted.")).toBeVisible()
  expect(new URL(page.url()).searchParams.get("id")).toBe(id)
  await expect(memoryText(page)).toHaveValue("Deploys go out on Tuesdays")
})

test("while erasing runs the page covers everything and reads nothing, and afterwards it follows changes made elsewhere again", async ({
  page,
}) => {
  let release = () => {}
  const held = new Promise<void>((resolve) => (release = resolve))
  let erasing = false
  const readsWhileErasing: string[] = []
  await page.route("**/api/memory", async (route) => {
    const { method } = route.request().postDataJSON() as { method: string }
    if (method === "erase_deleted") {
      erasing = true
      await held
    } else if (erasing) {
      readsWhileErasing.push(method)
    }
    await route.continue()
  })
  await page.goto(studio.link)
  await openNamespace(page, "user:bob")

  await page.getByRole("button", { name: "Erase deleted data" }).click()
  await asking(page, "Erase deleted data?")
    .getByRole("button", { name: "Erase" })
    .click()

  const erasingWindow = page.getByRole("alertdialog", { name: /^Erasing/ })
  await expect(erasingWindow).toBeVisible()
  await page.keyboard.press("Escape")
  // Longer than the 5-second refresh.
  await page.waitForTimeout(6_000)
  await expect(erasingWindow).toBeVisible()
  expect(readsWhileErasing).toEqual([])
  erasing = false
  release()

  await expect(
    page.getByText("Deleted data erased from the file.")
  ).toBeVisible()
  await expect(erasingWindow).toBeHidden()
  addElsewhere(db, "user:bob", { content: "Closes the bakery in August" })
  await expect(
    page.getByRole("button", { name: "user:bob, 4 active" })
  ).toBeVisible()
})

function asking(page: Page, title: string) {
  return page.getByRole("alertdialog", { name: title })
}
