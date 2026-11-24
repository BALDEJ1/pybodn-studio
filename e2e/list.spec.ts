import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import { expect, test, type Page } from "@playwright/test"

import { seed, startStudio, type Studio } from "./studio"

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

test("a search counts its matches on every tab, and one under another tab is a click away", async ({
  page,
}) => {
  await page.goto(studio.link)
  await openNamespace(page, "user:alice")

  // Typed fast, letter by letter: none of them may get lost on the way to the address.
  const search = page.getByRole("searchbox", { name: "Search memories" })
  await search.pressSequentially("Lisbon", { delay: 0 })
  await expect(search).toHaveValue("Lisbon")

  await expect(tab(page, "Active")).toHaveText("Active 0")
  await expect(tab(page, "Archived")).toHaveText("Archived 1")
  await expect(tab(page, "Expired")).toHaveText("Expired 0")
  await expect(page.getByText("1 under Archived.")).toBeVisible()

  await page.getByRole("button", { name: "Show Archived" }).click()

  await expect(rows(page)).toHaveText([/^Planning a trip to Lisbon/])

  // The place lives in the address, so a reload comes back to the same tab and search.
  await page.reload()
  await expect(tab(page, "Archived")).toHaveAttribute("aria-selected", "true")
  await expect(search).toHaveValue("Lisbon")
  await expect(rows(page)).toHaveText([/^Planning a trip to Lisbon/])
})

test("new words typed right after clearing a search never show the old matches", async ({
  page,
}) => {
  await page.goto(studio.link)
  await openNamespace(page, "user:alice")
  const search = page.getByRole("searchbox", { name: "Search memories" })
  await search.fill("Lisbon")
  // "Active 0" belongs to this search alone: the tab holds 8 memories, and "Miso" finds 1.
  await expect(tab(page, "Active")).toHaveText("Active 0")

  // Every text the tab takes from here on, however briefly.
  await page.evaluate(() => {
    const active = document.querySelector('[role="tab"]')!
    const seen: string[] = []
    Object.assign(window, { seen })
    new MutationObserver(() => seen.push(active.textContent ?? "")).observe(
      active,
      { subtree: true, childList: true, characterData: true }
    )
  })
  // The cross in the field goes away once pressed, and the keyboard stays in the field.
  await search
    .locator("..")
    .getByRole("button", { name: "Clear search" })
    .click()
  await page.keyboard.type("Miso")

  await expect(tab(page, "Active")).toHaveText("Active 1")
  const seen = await page.evaluate(() => Reflect.get(window, "seen"))
  expect(seen).not.toContain("Active 0")
})

test("on a phone, the app's Back and the browser's Back agree", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto(studio.link)
  await expect(heading(page)).toHaveText("agent:planner")
  await page.getByRole("button", { name: "Open namespaces" }).click()
  await openNamespace(page, "user:bob")

  await rows(page).first().click()
  await page.getByRole("button", { name: "Back to memories" }).click()
  await expect(heading(page)).toHaveText("user:bob")

  // The app's Back undid the pick, so the browser's Back now undoes the namespace.
  await page.goBack()
  await expect(heading(page)).toHaveText("agent:planner")
})

test("a memory written past the page shows up by itself, and hostile text stays text", async ({
  page,
}) => {
  const dialogs: string[] = []
  page.on("dialog", (dialog) => {
    dialogs.push(dialog.message())
    void dialog.dismiss()
  })
  await page.goto(studio.link)
  await openNamespace(page, "user:bob")
  await expect(rows(page)).toHaveCount(3)

  const turn = String.fromCodePoint(0x202e) // right-to-left override
  const hostile = `<img src=x onerror=alert(1)> javascript:alert(2) ${turn}gnp.exe`
  await addMemory(page, "user:bob", hostile + " filler".repeat(150_000))

  // The list is read again every few seconds, so the new memory arrives without a reload.
  await expect(rows(page).first()).toContainText("<img src=x onerror=alert(1)>")
  await rows(page).first().click()
  const memory = page.getByRole("region", { name: "Memory", exact: true })
  await expect(memory).toContainText("javascript:alert(2)")

  for (const pane of [memory, page.getByRole("region", { name: "Memories" })]) {
    await expect(pane.locator("img, a, script")).toHaveCount(0)
  }
  expect(dialogs).toEqual([])

  // The page still answers.
  await openNamespace(page, "user:alice")
  await expect(rows(page)).toHaveCount(8)
})

function openNamespace(page: Page, name: string) {
  return page.getByRole("button", { name: `${name}, ` }).click()
}

function heading(page: Page) {
  return page.getByRole("heading", { level: 1 })
}

function tab(page: Page, name: string) {
  return page.getByRole("tab", { name: new RegExp(`^${name}`) })
}

function rows(page: Page) {
  return page.getByRole("list", { name: "Memory list" }).getByRole("button")
}

/** Adds a memory past the page, as another program would, so only a refresh can show it. */
async function addMemory(page: Page, namespace: string, content: string) {
  const status = await page.evaluate(
    async (params) => {
      const response = await fetch("/api/memory", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ method: "add", params }),
      })
      return response.status
    },
    { namespace, content }
  )
  expect(status).toBe(200)
}
