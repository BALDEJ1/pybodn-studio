import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import { expect, test, type Page } from "@playwright/test"

import { memoryPane, memoryText, openNamespace, rows } from "./pages"
import { changeElsewhere, seed, startStudio, type Studio } from "./studio"

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

test("edits wait in their memory while another is open, and a keyboard save keeps them, a tag still being typed and all", async ({
  page,
}) => {
  await page.goto(studio.link)
  await openNamespace(page, "user:alice")
  await pick(page, "Allergic to peanuts")
  await memoryText(page).fill("Allergic to peanuts and cashews")
  // A key that names an object's prototype stays an ordinary key all the way to the file.
  await field(page, "Metadata").fill('{"__proto__": {"admin": true}}')

  // Another memory opens without the edits, and coming back finds them where they were.
  await pick(page, "Works from home on Fridays")
  await expect(memoryText(page)).toHaveValue("Works from home on Fridays")
  await pick(page, "Allergic to peanuts")
  await expect(memoryText(page)).toHaveValue("Allergic to peanuts and cashews")

  // A tag still being typed goes with the save, though nothing finished it.
  await field(page, "Tags").fill("nuts")
  await page.keyboard.press("ControlOrMeta+s")
  await expect(button(page, "Save")).toBeHidden()

  await page.reload()
  await expect(memoryText(page)).toHaveValue("Allergic to peanuts and cashews")
  await expect(button(page, "Remove tag nuts")).toBeVisible()
  await expect(field(page, "Metadata")).toHaveValue(
    /"__proto__": \{\s+"admin": true/
  )
  expect(await page.evaluate(() => "admin" in {})).toBe(false)
})

test("a memory another program changed during the edits: keep mine saves over it, load latest takes it", async ({
  page,
}) => {
  await page.goto(studio.link)
  await openNamespace(page, "user:alice")
  await pick(page, "Lives in Osaka")
  const id = new URL(page.url()).searchParams.get("id") ?? ""

  // Its own edit and another program's touch different fields: keeping mine keeps both.
  await field(page, "Source").fill("profile page")
  changeElsewhere(db, "user:alice", id, { tags: ["location", "travel"] })
  await expect(conflict(page)).toBeVisible()
  await button(page, "Keep mine").click()
  await expect(conflict(page)).toBeHidden()
  await expect(button(page, "Save")).toBeHidden()
  await page.reload()
  await expect(field(page, "Source")).toHaveValue("profile page")
  await expect(button(page, "Remove tag travel")).toBeVisible()

  // A save on the old version is refused rather than written over the newer text.
  await memoryText(page).fill("Lives in Kyoto")
  changeElsewhere(db, "user:alice", id, { content: "Lives in Tokyo" })
  await button(page, "Save").click()
  await expect(conflict(page)).toBeVisible()
  await button(page, "Load latest").click()
  await expect(memoryText(page)).toHaveValue("Lives in Tokyo")
  await expect(button(page, "Save")).toBeHidden()
  await page.reload()
  await expect(memoryText(page)).toHaveValue("Lives in Tokyo")
})

/** Opens the memory whose row starts with `text`. */
async function pick(page: Page, text: string) {
  await rows(page).filter({ hasText: text }).click()
  await expect(memoryText(page)).toHaveValue(new RegExp(`^${text}`))
}

function field(page: Page, name: string) {
  return memoryPane(page).getByRole("textbox", { name, exact: true })
}

function button(page: Page, name: string) {
  return memoryPane(page).getByRole("button", { name, exact: true })
}

function conflict(page: Page) {
  return memoryPane(page)
    .getByRole("alert")
    .filter({ hasText: "Changed elsewhere" })
}
