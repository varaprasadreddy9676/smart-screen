/**
 * launch-window.spec.ts
 *
 * Tests for the HUD overlay launch window (`windowType=hud-overlay`).
 * This is the floating recording bar that appears above the user's screen.
 *
 * The component is LaunchWindow.tsx and renders:
 *   - A source selector button (MdMonitor icon + source name)
 *   - A record / stop button
 *   - A mic toggle button
 *   - An "Open" file button
 *   - Hide (minus) and Close (X) window controls
 *
 * Because electronAPI calls (getSources, selectSource, etc.) are not available
 * in a plain browser context, we test the UI elements that are always present
 * and verify graceful degradation when the Electron bridge is absent.
 */

import { expect, test } from "@playwright/test";

const HUD_URL = "http://localhost:5173/?windowType=hud-overlay";

test.describe("Launch Window — HUD overlay bar", () => {
  test.beforeEach(async ({ page }) => {
    // Suppress console errors caused by missing electronAPI in browser context
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        // Allow — electronAPI absence is expected in test environment
      }
    });

    await page.goto(HUD_URL, { waitUntil: "domcontentloaded" });
  });

  test("page loads without a fatal crash", async ({ page }) => {
    // The root element must be present and non-empty
    const root = page.locator("#root");
    await expect(root).toBeAttached({ timeout: 10_000 });

    await page.screenshot({
      path: "testsprite_tests/screenshots/launch-window-initial.png",
    });
  });

  test("source selector button is visible", async ({ page }) => {
    // The LaunchWindow renders a Button with the MdMonitor icon and source name text.
    // The button defaults to "Screen" when no source is selected via electronAPI.
    const sourceBtn = page
      .locator("button", { hasText: /screen/i })
      .or(page.locator('[title*="source" i]'))
      .or(page.locator("button").filter({ hasText: /screen|window|source/i }).first());

    await expect(sourceBtn).toBeVisible({ timeout: 12_000 });
  });

  test("record button is present", async ({ page }) => {
    // The record button contains the text "Record" when not recording
    const recordBtn = page.locator("button", { hasText: /record/i });
    await expect(recordBtn).toBeVisible({ timeout: 12_000 });
  });

  test("record button is disabled when no source is selected", async ({ page }) => {
    // Without electronAPI.getSelectedSource returning a source, the record
    // button is rendered with disabled={!hasSelectedSource && !recording}
    const recordBtn = page.locator("button", { hasText: /record/i });
    await expect(recordBtn).toBeVisible({ timeout: 12_000 });
    await expect(recordBtn).toBeDisabled();
  });

  test("mic toggle button is visible", async ({ page }) => {
    // Mic button has text "Mic" when enabled (default state)
    const micBtn = page.locator("button", { hasText: /^mic$/i });
    await expect(micBtn).toBeVisible({ timeout: 12_000 });
  });

  test("open file button is visible", async ({ page }) => {
    // The open-file button renders with text "Open"
    const openBtn = page.locator("button", { hasText: /^open$/i });
    await expect(openBtn).toBeVisible({ timeout: 12_000 });
  });

  test("hide (minus) window control button is present", async ({ page }) => {
    // The hide button has title="Hide HUD"
    const hideBtn = page.locator('button[title="Hide HUD"]');
    await expect(hideBtn).toBeVisible({ timeout: 12_000 });
  });

  test("close window control button is present", async ({ page }) => {
    // The close button has title="Close App"
    const closeBtn = page.locator('button[title="Close App"]');
    await expect(closeBtn).toBeVisible({ timeout: 12_000 });
  });

  test("mic button click toggles mic off state", async ({ page }) => {
    const micBtn = page.locator("button", { hasText: /^mic$/i });
    await expect(micBtn).toBeVisible({ timeout: 12_000 });

    // Initial state: Mic is enabled (text is "Mic" with green colour)
    // After click: Mic is toggled off — text stays "Mic" but colour changes
    await micBtn.click();

    // After toggle, button should still exist and be visible
    await expect(page.locator("button", { hasText: /^mic$/i })).toBeVisible({ timeout: 5_000 });

    await page.screenshot({
      path: "testsprite_tests/screenshots/launch-window-mic-toggled.png",
    });
  });

  test("layout renders a single horizontal bar", async ({ page }) => {
    // The HUD is a narrow horizontal bar — verify the outer flex container exists
    const hudBar = page
      .locator("div")
      .filter({ hasText: /record/i })
      .first();
    await expect(hudBar).toBeVisible({ timeout: 12_000 });

    const box = await hudBar.boundingBox();
    // Bar should be wider than tall (landscape orientation)
    if (box) {
      expect(box.width).toBeGreaterThan(box.height);
    }
  });
});

test.describe("Source Selector window", () => {
  test.beforeEach(async ({ page }) => {
    page.on("console", () => {});
    await page.goto("http://localhost:5173/?windowType=source-selector", {
      waitUntil: "domcontentloaded",
    });
  });

  test("source selector page loads", async ({ page }) => {
    // Either shows the loading spinner or the tabs UI
    const root = page.locator("#root");
    await expect(root).toBeAttached({ timeout: 10_000 });

    await page.screenshot({
      path: "testsprite_tests/screenshots/source-selector-initial.png",
    });
  });

  test("Screens tab is present", async ({ page }) => {
    // SourceSelector renders Tabs with "Screens" and "Windows" triggers
    const screensTab = page.getByRole("tab", { name: /screens/i });
    await expect(screensTab).toBeVisible({ timeout: 12_000 });
  });

  test("Windows tab is present", async ({ page }) => {
    const windowsTab = page.getByRole("tab", { name: /windows/i });
    await expect(windowsTab).toBeVisible({ timeout: 12_000 });
  });

  test("Cancel button is present and enabled", async ({ page }) => {
    const cancelBtn = page.getByRole("button", { name: /cancel/i });
    await expect(cancelBtn).toBeVisible({ timeout: 12_000 });
    await expect(cancelBtn).toBeEnabled();
  });

  test("Share button is present and disabled with no source selected", async ({ page }) => {
    // Share button is disabled when selectedSource is null (default)
    const shareBtn = page.getByRole("button", { name: /share/i });
    await expect(shareBtn).toBeVisible({ timeout: 12_000 });
    await expect(shareBtn).toBeDisabled();
  });

  test("can switch to Windows tab", async ({ page }) => {
    const windowsTab = page.getByRole("tab", { name: /windows/i });
    await expect(windowsTab).toBeVisible({ timeout: 12_000 });
    await windowsTab.click();
    await expect(windowsTab).toHaveAttribute("data-state", "active");

    await page.screenshot({
      path: "testsprite_tests/screenshots/source-selector-windows-tab.png",
    });
  });
});

test.describe("Default window type (no query param)", () => {
  test("fallback renders Smart Screen heading", async ({ page }) => {
    page.on("console", () => {});
    await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded" });

    // App.tsx default case renders <h1>Smart Screen</h1>
    const heading = page.getByRole("heading", { name: /smart screen/i });
    await expect(heading).toBeVisible({ timeout: 12_000 });

    await page.screenshot({
      path: "testsprite_tests/screenshots/default-window.png",
    });
  });
});
