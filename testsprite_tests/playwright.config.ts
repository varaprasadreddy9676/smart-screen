import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for Smart Screen Electron app E2E tests.
 *
 * The Vite dev renderer is accessed directly at http://localhost:5173.
 * Window type is controlled via the `windowType` query parameter, matching
 * the routing logic in src/App.tsx.
 *
 * Run the dev server first: npm run dev
 * Then run tests:           npx playwright test --config testsprite_tests/playwright.config.ts
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false, // Run sequentially to avoid port conflicts
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 2 : 1,
  workers: 1,
  reporter: [
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["junit", { outputFile: "test-results/junit.xml" }],
    ["list"],
  ],
  use: {
    // Base URL points to Vite dev server renderer
    baseURL: "http://localhost:5173",
    // Generous timeout for Electron IPC initialisation
    actionTimeout: 15_000,
    navigationTimeout: 20_000,
    // Capture trace on first retry to aid debugging flaky tests
    trace: "on-first-retry",
    // Always capture screenshots on failure
    screenshot: "only-on-failure",
    // Capture video on first retry
    video: "on-first-retry",
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
      },
    },
  ],

  // Artifact output directory
  outputDir: "./test-results/artifacts",

  // Global timeout per test (ms)
  timeout: 60_000,

  // Expect timeout for assertions
  expect: {
    timeout: 15_000,
  },
});
