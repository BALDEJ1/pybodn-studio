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
import { seed, startStudio, type Studio } from "./studio"

const PHONE = { width: 375, height: 812 }
const WIDE = { width: 1280, height: 720 }
// The keyboard moves within a frame or two; the toast, gone after 8 seconds, must not do it instead.
const SOON = { timeout: 3_000 }

let folder: string
let studio: Studio

test.beforeEach(async () => {
  folder = mkdtempSync(path.join(tmpdir(), "pybodn-studio-"))
  const db = path.join(folder, "memory.db")
  seed(db)
  studio = await startStudio(db)
})

test.afterEach(async () => {
  await studio.stop()
  rmSync(folder, { recursive: true, force: true })
})

test("the list is one Tab stop, and the arrows, Home and End move along it with the memory following", async ({
  page,
}) => {
  await page.goto(studio.link)
  await openNamespace(page, "user:alice")
  await expect(memoryText(page)).toBeVisible()

  await page.keyboard.press("/")
  await expect(search(page)).toBeFocused(SOON)
  await expect(search(page)).toHaveValue("")
  await page.keyboard.press("ArrowDown")
  await expect(rows(page).first()).toBeFocused(SOON)

  await page.keyboard.press("ArrowDown")
  await expect(rows(page).nth(1)).toBeFocused(SOON)
  await expectShown(page, 1)
  await page.keyboard.press("End")
  await expect(rows(page).last()).toBeFocused(SOON)
  await expectShown(page, -1)
  await page.keyboard.press("Home")
  await expect(rows(page).first()).toBeFocused(SOON)
  await expectShown(page, 0)

  // Tab leaves the list at once, and coming back lands on the memory shown.
  await rows(page).nth(2).click()
  await page.keyboard.press("Tab")
  await expect(page.locator("[data-row]:focus")).toHaveCount(0)
  await page.keyboard.press("Shift+Tab")
  await expect(rows(page).nth(2)).toBeFocused(SOON)
})

test("Escape clears the search first, and in a memory goes back to its row", async ({
  page,
}) => {
  await page.goto(studio.link)
  await openNamespace(page, "user:alice")
  await expect(rows(page)).toHaveCount(8)

  await search(page).fill("dog")
  await expect(rows(page)).toHaveCount(1)
  await page.keyboard.press("Escape")
  await expect(search(page)).toHaveValue("")
  await expect(rows(page)).toHaveCount(8)
  await expect(search(page)).toBeFocused(SOON)
  // Clearing is a step of its own, as with the clear button: Back brings the search back.
  await page.goBack()
  await expect(search(page)).toHaveValue("dog")
  await search(page).press("Escape")

  await rows(page).nth(3).click()
  await memoryText(page).click()
  await page.keyboard.press("Escape")
  await expect(rows(page).nth(3)).toBeFocused(SOON)
})

test("letters typed into a field stay text, and Ctrl+S or ⌘S saves nothing behind a dialog", async ({
  page,
}) => {
  await page.goto(studio.link)
  await openNamespace(page, "user:bob")
  await memoryText(page).fill("Runs on weekends ")
  await memoryText(page).press("n")
  await memoryText(page).press("e")
  await memoryText(page).press("/")
  await expect(memoryText(page)).toHaveValue("Runs on weekends ne/")
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect(page.getByRole("alertdialog")).toHaveCount(0)

  await page.getByRole("button", { name: "New memory" }).click()
  const dialog = page.getByRole("dialog", { name: "New memory" })
  await expect(dialog).toBeVisible()
  await page.keyboard.press("ControlOrMeta+s")
  await page.keyboard.press("Escape")
  await expect(dialog).toBeHidden()
  await expect(
    memoryPane(page).getByRole("button", { name: "Save" })
  ).toBeVisible()
})

test("N opens a new memory with the keyboard in its text, and Ctrl+Enter or ⌘Enter adds it, a tag still being typed included", async ({
  page,
}) => {
  await page.goto(studio.link)
  await openNamespace(page, "user:alice")
  await expect(rows(page)).toHaveCount(8)

  await page.keyboard.press("n")
  const dialog = page.getByRole("dialog", { name: "New memory" })
  const text = dialog.getByRole("textbox", { name: "Memory" })
  await expect(text).toBeFocused(SOON)
  await text.fill("Brings a laptop to every meeting")
  await dialog.getByRole("textbox", { name: "Tags" }).fill("work")
  await page.keyboard.press("ControlOrMeta+Enter")

  await expect(dialog).toBeHidden()
  await expect(memoryText(page)).toHaveValue("Brings a laptop to every meeting")
  await expect(
    memoryPane(page).getByRole("button", { name: "Remove tag work" })
  ).toBeVisible()
  // Sent once: one memory more.
  await expect(
    page.getByRole("button", { name: "user:alice, 9 active" })
  ).toBeVisible()
})

test("E asks before archiving, then the keyboard is on the row in its place; on an archived memory E restores it at once", async ({
  page,
}) => {
  await page.goto(studio.link)
  await openNamespace(page, "user:bob")
  const next = await rows(page).nth(2).textContent()
  await rows(page).nth(1).click()
  await expectShown(page, 1)

  await page.keyboard.press("e")
  const archive = page
    .getByRole("alertdialog", { name: "Archive this memory?" })
    .getByRole("button", { name: "Archive" })
  await expect(archive).toBeFocused(SOON)
  await page.keyboard.press("Enter")

  await expect(rows(page)).toHaveCount(2)
  await expect(rows(page).nth(1)).toBeFocused(SOON)
  expect(next).toContain(await memoryText(page).inputValue())

  await tab(page, "Archived").click()
  await rows(page).first().click()
  await expectShown(page, 0)
  await page.keyboard.press("e")
  await expect(rows(page)).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: "user:bob, 3 active" })
  ).toBeVisible()
  // Nothing is left to stand on in the tab, so the keyboard waits in the search.
  await expect(search(page)).toBeFocused(SOON)
})

test("on a phone, a memory picked takes the keyboard, Escape gives it back to its row, and / goes back to the search", async ({
  page,
}) => {
  await page.setViewportSize(PHONE)
  await page.goto(studio.link)
  await page.getByRole("button", { name: "Open namespaces" }).click()
  await openNamespace(page, "user:bob")

  await rows(page).nth(1).focus()
  await page.keyboard.press("Enter")
  await expect(memoryPane(page)).toBeFocused(SOON)

  await page.keyboard.press("Escape")
  await expect(rows(page).nth(1)).toBeFocused(SOON)
  expect(new URL(page.url()).searchParams.has("id")).toBe(false)

  await page.keyboard.press("Enter")
  await expect(memoryPane(page)).toBeFocused(SOON)
  await page.keyboard.press("/")
  await expect(search(page)).toBeFocused(SOON)
  expect(new URL(page.url()).searchParams.has("id")).toBe(false)
})

test("on a phone, archiving leaves the keyboard on the row in the memory's place, and adding puts it in the memory added", async ({
  page,
}) => {
  await page.setViewportSize(PHONE)
  await page.goto(studio.link)
  await page.getByRole("button", { name: "Open namespaces" }).click()
  await openNamespace(page, "user:bob")
  const next = await rows(page).nth(1).textContent()

  await rows(page).first().click()
  await memoryPane(page).getByRole("button", { name: "Archive" }).click()
  await page
    .getByRole("alertdialog", { name: "Archive this memory?" })
    .getByRole("button", { name: "Archive" })
    .click()
  await expect(rows(page)).toHaveCount(2)
  await expect(rows(page).first()).toBeFocused(SOON)
  expect(await rows(page).first().textContent()).toBe(next)

  await page.getByRole("button", { name: "New memory" }).click()
  const dialog = page.getByRole("dialog", { name: "New memory" })
  await dialog
    .getByRole("textbox", { name: "Memory" })
    .fill("Brings a bike to work")
  await dialog.getByRole("button", { name: "Add memory" }).click()
  await expect(memoryText(page)).toHaveValue("Brings a bike to work")
  await expect(memoryPane(page)).toBeFocused(SOON)
})

test("the New memory dialog stays open when a press that began in it ends on the backdrop, and closes on a click there", async ({
  page,
}) => {
  await page.goto(studio.link)
  await openNamespace(page, "user:bob")
  await page.getByRole("button", { name: "New memory" }).click()
  const dialog = page.getByRole("dialog", { name: "New memory" })
  const text = dialog.getByRole("textbox", { name: "Memory" })
  await text.fill("Selected by dragging past the edge")

  // Selecting the text with the pointer and letting go past the dialog's edge.
  const box = await text.boundingBox()
  if (box === null) throw new Error("The memory text has no box")
  await page.mouse.move(box.x + box.width - 4, box.y + 8)
  await page.mouse.down()
  await page.mouse.move(8, 8, { steps: 5 })
  await page.mouse.up()
  await expect(dialog).toBeVisible()
  await expect(text).toHaveValue("Selected by dragging past the edge")

  await page.mouse.click(8, 8)
  await expect(dialog).toBeHidden()
})

test("the namespaces sheet does not open again by itself after the window was wide", async ({
  page,
}) => {
  await page.setViewportSize(PHONE)
  await page.goto(studio.link)
  await expect(heading(page)).toHaveText("agent:planner")
  await page.getByRole("button", { name: "Open namespaces" }).click()
  await expect(page.getByRole("dialog")).toBeVisible()

  await page.setViewportSize(WIDE)
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await page.setViewportSize(PHONE)
  // A sheet that came back would be open by now.
  await page.waitForTimeout(1_000)
  await expect(page.getByRole("dialog")).toHaveCount(0)
})

function search(page: Page) {
  return page.getByRole("searchbox", { name: "Search memories" })
}

/** The memory beside the list is the one of row `index`; -1 is the last row. */
async function expectShown(page: Page, index: number) {
  const row = index === -1 ? rows(page).last() : rows(page).nth(index)
  await expect(row).toHaveAttribute("aria-current", "true")
  const content = await row.locator("span").first().textContent()
  await expect(memoryText(page)).toHaveValue(content ?? "")
}
