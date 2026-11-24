import { configDefaults, defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    // The browser scenarios in e2e/ run with Playwright.
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
})
