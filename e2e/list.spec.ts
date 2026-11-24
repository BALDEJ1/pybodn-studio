import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import { expect, test, type Page } from "@playwright/test"

import { seed, startStudio, type Studio } from "./studio"

const PHONE = { width: 375, height: 812 }

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
  await page.setViewportSize(PHONE)
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

test("on a phone, Back from a memory opened by a link goes to its list instead of leaving Studio", async ({
  page,
  context,
}) => {
  const link = await memoryLink(page, "user:bob")
  const phone = await context.newPage()
  await phone.setViewportSize(PHONE)
  await phone.goto(link.url)
  await expect(memoryText(phone)).toHaveText(link.text)

  await phone.getByRole("button", { name: "Back to memories" }).click()
  await expect(rows(phone).first()).toBeVisible()
  await expect(heading(phone)).toHaveText("user:bob")
  expect(new URL(phone.url()).searchParams.has("id")).toBe(false)
})

test("on a phone, a memory opened by a link shows why the namespaces could not be read, and Retry", async ({
  page,
  context,
}) => {
  const link = await memoryLink(page, "user:bob")
  const phone = await context.newPage()
  await phone.setViewportSize(PHONE)
  const failing = new Set(["overview"])
  let overviews = 0
  await phone.route("**/api/memory", (route) => {
    const { method } = route.request().postDataJSON() as { method: string }
    if (method === "overview") overviews += 1
    if (!failing.has(method)) return route.fallback()
    return route.fulfill({
      json: { ok: false, error: { code: "busy", message: BUSY } },
    })
  })
  await phone.goto(link.url)

  // The memory could be read, but it waits for the namespaces: the list shows why they failed.
  const list = phone.getByRole("region", { name: "Memories" })
  const retry = phone.getByRole("button", { name: "Retry" })
  await expect(list.getByText(BUSY)).toBeVisible()
  await expect(retry).toBeVisible()
  await expect(memoryText(phone)).toBeHidden()

  // A failed read waits for Retry instead of failing again every few seconds.
  const tried = overviews
  await phone.waitForTimeout(6_000)
  expect(overviews).toBe(tried)

  // The namespaces come back and the memory opens; a failed read of it has its own Retry.
  failing.delete("overview")
  failing.add("get")
  await retry.click()
  const memory = phone.getByRole("region", { name: "Memory", exact: true })
  await expect(memory.getByText(BUSY)).toBeVisible()
  failing.delete("get")
  await retry.click()
  await expect(memoryText(phone)).toHaveText(link.text)
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

const BUSY = "Too many requests are waiting. Try again in a moment."

/** The address of the newest memory in `namespace` once picked, to open as a link, and its text. */
async function memoryLink(page: Page, namespace: string) {
  await page.goto(studio.link)
  await openNamespace(page, namespace)
  await rows(page).first().click()
  await expect(page).toHaveURL(/[?&]id=/)
  return { url: page.url(), text: (await memoryText(page).textContent()) ?? "" }
}

function memoryText(page: Page) {
  return page.getByRole("region", { name: "Memory", exact: true }).locator("p")
}

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
