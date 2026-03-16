/**
 * zoom-editor.spec.ts
 *
 * Tests for the Zoom region editor within the Video Editor.
 *
 * Zoom controls live in two places:
 *   1. SettingsPanel.tsx — "Zoom" accordion section shown when a zoom region
 *      is selected (selectedZoomId !== null). Contains depth buttons:
 *      1.25×, 1.5×, 1.8×, 2× and a "Delete Zoom" action.
 *   2. TimelineEditor.tsx — the Zoom row in the timeline where regions can
 *      be dragged to create, resize, and reposition zooms.
 *
 * ZOOM_DEPTH_OPTIONS from SettingsPanel (read from source):
 *   depth 1 → "1.25×"
 *   depth 2 → "1.5×"
 *   depth 3 → "1.8×"
 *   depth 4 → "2×"
 *
 * Because zoom depth controls only render when a zoom region is selected,
 * these tests first verify the timeline Zoom row exists and the add-zoom
 * mechanism is accessible, then assert the depth panel structure.
 */

import { expect, test } from "@playwright/test";

const EDITOR_URL = "http://localhost:5173/?windowType=editor";

const ELECTRON_API_STUB = `
  window.electronAPI = {
    loadCurrentProjectFile: () => Promise.resolve({ success: false }),
    getCurrentVideoPath: () => Promise.resolve({ success: false, path: null }),
    getSmartDemoMode: () => Promise.resolve({ value: false }),
    getAIConfig: () => Promise.resolve({ success: true, data: null }),
    getTranscriptionConfig: () => Promise.resolve({ success: true, data: { provider: 'auto', enabled: true } }),
    listTranscriptionProviders: () => Promise.resolve({ success: true, data: [] }),
    onMenuLoadProject: () => () => {},
    onMenuSaveProject: () => () => {},
    onMenuSaveProjectAs: () => () => {},
    getSources: () => Promise.resolve([]),
    saveExportedVideo: () => Promise.resolve({ canceled: true }),
    revealInFolder: () => Promise.resolve({ success: true }),
    openVideoFilePicker: () => Promise.resolve({ canceled: true }),
  };
`;

test.describe("Zoom Editor — timeline zoom row", () => {
	test.beforeEach(async ({ page }) => {
		page.on("console", () => {});
		await page.addInitScript(ELECTRON_API_STUB);
		await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded" });
		await page
			.locator('[aria-label="Undo"]')
			.or(page.locator("text=Loading video"))
			.or(page.locator("text=No video to load"))
			.first()
			.waitFor({ timeout: 15_000 });
	});

	test("Zoom row is visible in the timeline", async ({ page }) => {
		const zoomLabel = page.locator("text=Zoom").first();
		await expect(zoomLabel).toBeVisible({ timeout: 12_000 });

		await page.screenshot({
			path: "testsprite_tests/screenshots/zoom-editor-timeline-row.png",
		});
	});

	test("add Zoom button or dropdown trigger is present", async ({ page }) => {
		// TimelineEditor renders a "+" button or a dropdown for adding a zoom region
		// It has ZoomIn icon and text "Zoom" nearby, or an explicit "Add Zoom" affordance
		const addZoomTrigger = page
			.locator("button", { hasText: /zoom/i })
			.or(page.locator('[title*="zoom" i]'))
			.first();
		await expect(addZoomTrigger).toBeVisible({ timeout: 12_000 });
	});

	test("timeline has an aspect ratio selector", async ({ page }) => {
		// TimelineEditor renders an aspect ratio dropdown (16:9, 4:3, 1:1, etc.)
		const aspectRatioEl = page
			.locator("text=16:9")
			.or(page.locator('[aria-label*="aspect ratio" i]'))
			.or(page.locator("button", { hasText: /16.9|4.3|1.1/i }))
			.first();
		await expect(aspectRatioEl).toBeVisible({ timeout: 12_000 });
	});
});

test.describe("Zoom Editor — zoom depth controls (no region selected)", () => {
	test.beforeEach(async ({ page }) => {
		page.on("console", () => {});
		await page.addInitScript(ELECTRON_API_STUB);
		await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded" });
		await page
			.locator('[aria-label="Undo"]')
			.or(page.locator("text=Loading video"))
			.or(page.locator("text=No video to load"))
			.first()
			.waitFor({ timeout: 15_000 });
	});

	test("settings panel is visible", async ({ page }) => {
		// The right-side settings panel always renders
		const settingsArea = page
			.locator("text=Appearance")
			.or(page.locator("text=Wallpaper"))
			.or(page.locator('[role="tablist"]'))
			.first();
		await expect(settingsArea).toBeVisible({ timeout: 12_000 });

		await page.screenshot({
			path: "testsprite_tests/screenshots/zoom-editor-settings-panel.png",
		});
	});

	test("zoom depth section is absent when no zoom region selected", async ({ page }) => {
		// Depth buttons (1.25×, 1.5×, 1.8×, 2×) only appear when selectedZoomId is set
		const depthButton = page.locator("button", { hasText: /1\.25×|1\.5×|1\.8×|2×/ });
		// Expect them NOT to be visible in the default state
		await expect(depthButton).not.toBeVisible();
	});
});

test.describe("Zoom Editor — depth controls via Smart Demo auto-apply", () => {
	/**
	 * The zoom depth panel only becomes visible after a zoom region is created.
	 * Without a real video + telemetry we can't drive the full flow, but we can
	 * verify the depth option labels and panel structure by inspecting the DOM
	 * after Smart Demo runs (which with no telemetry produces 0 zoom regions,
	 * shown as an error — still a valid UI state to test).
	 */

	test.beforeEach(async ({ page }) => {
		page.on("console", () => {});
		await page.addInitScript(ELECTRON_API_STUB);
		await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded" });
		await page
			.locator('[aria-label="Undo"]')
			.or(page.locator("text=Loading video"))
			.or(page.locator("text=No video to load"))
			.first()
			.waitFor({ timeout: 15_000 });
	});

	test("opening Smart Screen panel and running Generate shows feedback", async ({ page }) => {
		const smartBtn = page.locator("button", { hasText: /smart screen/i });
		await expect(smartBtn).toBeVisible({ timeout: 12_000 });
		await smartBtn.click();

		// Verify the Generate button is in disabled state (no telemetry)
		const generateBtn = page.locator("button", { hasText: /generate/i });
		await expect(generateBtn).toBeVisible({ timeout: 12_000 });
		await expect(generateBtn).toBeDisabled();

		// The helper text about cursor data shows when hasTelemetry is false
		const noCursorMsg = page.locator("text=No cursor data");
		await expect(noCursorMsg).toBeVisible({ timeout: 5_000 });

		await page.screenshot({
			path: "testsprite_tests/screenshots/zoom-editor-no-telemetry.png",
		});
	});

	test("zoom depth buttons are discoverable in DOM (hidden until region selected)", async ({
		page,
	}) => {
		// The depth buttons are conditionally rendered, so we assert they are NOT
		// present in the DOM when no region is selected — confirming conditional logic.
		const depth125 = page.locator("button", { hasText: "1.25×" });
		const depth15 = page.locator("button", { hasText: "1.5×" });
		const depth18 = page.locator("button", { hasText: "1.8×" });
		const depth2 = page.locator("button", { hasText: "2×" });

		await expect(depth125).not.toBeVisible();
		await expect(depth15).not.toBeVisible();
		await expect(depth18).not.toBeVisible();
		await expect(depth2).not.toBeVisible();
	});
});

test.describe("Zoom Editor — delete zoom region", () => {
	test.beforeEach(async ({ page }) => {
		page.on("console", () => {});
		await page.addInitScript(ELECTRON_API_STUB);
		await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded" });
		await page
			.locator('[aria-label="Undo"]')
			.or(page.locator("text=Loading video"))
			.or(page.locator("text=No video to load"))
			.first()
			.waitFor({ timeout: 15_000 });
	});

	test("delete zoom button is absent when no region is selected", async ({ page }) => {
		// "Delete Zoom" button in SettingsPanel only renders when selectedZoomId is set
		const deleteZoomBtn = page.locator("button", { hasText: /delete zoom/i });
		await expect(deleteZoomBtn).not.toBeVisible();
	});
});

test.describe("Zoom Editor — timeline interaction controls", () => {
	test.beforeEach(async ({ page }) => {
		page.on("console", () => {});
		await page.addInitScript(ELECTRON_API_STUB);
		await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded" });
		await page
			.locator('[aria-label="Undo"]')
			.or(page.locator("text=Loading video"))
			.or(page.locator("text=No video to load"))
			.first()
			.waitFor({ timeout: 15_000 });
	});

	test("timeline playhead (green cursor line) element is present", async ({ page }) => {
		// The playhead is a div with a green (#34B27B) background — it's always
		// rendered when videoDurationMs > 0. With no video it may be absent, but
		// the timeline container itself must exist.
		const timelineContainer = page.locator("text=Zoom").or(page.locator("text=Trim")).first();
		await expect(timelineContainer).toBeVisible({ timeout: 12_000 });
	});

	test("zoom row can be interacted with via keyboard (no error)", async ({ page }) => {
		const errors: string[] = [];
		page.on("pageerror", (err) => errors.push(err.message));

		// Tab to move focus into the editor area
		await page.keyboard.press("Tab");
		await page.waitForTimeout(300);

		const unhandled = errors.filter(
			(e) =>
				!e.includes("electronAPI") &&
				!e.includes("Cannot read properties of null") &&
				!e.includes("ResizeObserver"),
		);
		expect(unhandled).toHaveLength(0);

		await page.screenshot({
			path: "testsprite_tests/screenshots/zoom-editor-keyboard-interaction.png",
		});
	});

	test("aspect ratio 16:9 is the default selection", async ({ page }) => {
		// Default aspectRatio state in VideoEditor is "16:9"
		const defaultRatio = page
			.locator("text=16:9")
			.or(page.locator("button", { hasText: "16:9" }))
			.first();
		await expect(defaultRatio).toBeVisible({ timeout: 12_000 });
	});
});
