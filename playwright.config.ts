import { defineConfig, devices } from "@playwright/test"

/** Scenarios on the built app: run `npm run build` first. Each one starts its own Studio. */
export default defineConfig({
  testDir: "e2e",
  workers: 1,
  // The first start of the bridge may install Python and pybodn.
  timeout: 180_000,
  expect: { timeout: 120_000 },
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? "github" : "list",
  use: { ...devices["Desktop Chrome"] },
})
