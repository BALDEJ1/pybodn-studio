import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import { expect, test } from "@playwright/test"

import { seed, startStudio, type Studio } from "./studio"

let folder: string
let studio: Studio | undefined

test.beforeEach(() => {
  folder = mkdtempSync(path.join(tmpdir(), "pybodn-studio-"))
})

test.afterEach(async () => {
  await studio?.stop()
  studio = undefined
  rmSync(folder, { recursive: true, force: true })
})

test("without PYBODN_DB Studio asks for a memory file", async ({ page }) => {
  studio = await startStudio(undefined)

  await page.goto(studio.link)

  await expect(page.locator("[data-problem]")).toHaveAttribute(
    "data-problem",
    "missing_env"
  )
})

test("a missing file is never created, and once it exists Studio reads it", async ({
  page,
}) => {
  const db = path.join(folder, "memory.db")
  studio = await startStudio(db)

  await page.goto(studio.link)
  await expect(page.locator("[data-problem]")).toHaveAttribute(
    "data-problem",
    "no_file"
  )
  expect(existsSync(db)).toBe(false)

  seed(db)
  await page.getByRole("button", { name: "Try again" }).click()

  const namespaces = page.getByRole("navigation", { name: "Namespaces" })
  await expect(namespaces.getByRole("button")).toHaveText([
    "agent:planner",
    "support-bot",
    "user:alice",
    "user:bob",
  ])
})
