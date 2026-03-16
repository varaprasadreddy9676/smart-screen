/**
 * video-editor.spec.ts
 *
 * Tests for the Video Editor UI — the main editing workspace loaded at
 * `windowType=editor`.
 *
 * Key areas:
 *   - Top toolbar (undo, redo, AI status, Compare Original, Smart Screen, AI Assist)
 *   - Video preview area with "Polished Preview" / "Original Preview" badge
 *   - Playback controls (play/pause button, seek slider, time display)
 *   - Timeline editor rows (Zoom, Trim, Captions, Speed)
 *   - Right-side SettingsPanel tabs (Appearance, Video, Export, etc.)
 *
 * All tests run with a minimal electronAPI stub to move past the loading state.
 */

import { expect, test } from "@playwright/test";

const EDITOR_URL = "http://localhost:5173/?windowType=editor";

// Minimal stub that resolves getCurrentVideoPath to null so the editor
// transitions out of "loading" into the idle "no video" state.
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
  };
`;

test.describe("Video Editor — toolbar", () => {
	test.beforeEach(async ({ page }) => {
		page.on("console", () => {});
		await page.addInitScript(ELECTRON_API_STUB);
		await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded" });
		// Wait for the editor shell to appear
		await page
			.locator('[aria-label="Undo"]')
			.or(page.locator("text=Loading video"))
			.or(page.locator("text=No video to load"))
			.first()
			.waitFor({ timeout: 15_000 });
	});

	test("toolbar renders without crash", async ({ page }) => {
		const root = page.locator("#root");
		await expect(root).toBeAttached();

		await page.screenshot({
			path: "testsprite_tests/screenshots/video-editor-toolbar.png",
		});
	});

	test("Undo button is visible", async ({ page }) => {
		const undoBtn = page.locator('[aria-label="Undo"]');
		await expect(undoBtn).toBeVisible({ timeout: 12_000 });
	});

	test("Redo button is visible", async ({ page }) => {
		const redoBtn = page.locator('[aria-label="Redo"]');
		await expect(redoBtn).toBeVisible({ timeout: 12_000 });
	});

	test("AI status badge is visible", async ({ page }) => {
		// AI status badge shows e.g. "AI Not configured" or similar
		const aiBadge = page.locator("span", { hasText: /^ai /i });
		await expect(aiBadge).toBeVisible({ timeout: 12_000 });
	});

	test("Compare Original button is visible", async ({ page }) => {
		const compareBtn = page.locator("button", { hasText: /compare original/i });
		await expect(compareBtn).toBeVisible({ timeout: 12_000 });
	});

	test("Smart Screen button is visible", async ({ page }) => {
		const smartBtn = page.locator("button", { hasText: /smart screen/i });
		await expect(smartBtn).toBeVisible({ timeout: 12_000 });
	});

	test("AI Assist button is visible", async ({ page }) => {
		const aiBtn = page.locator("button", { hasText: /ai assist/i });
		await expect(aiBtn).toBeVisible({ timeout: 12_000 });
	});

	test("clicking Compare Original toggles to 'Show Polished'", async ({ page }) => {
		const compareBtn = page.locator("button", { hasText: /compare original/i });
		await expect(compareBtn).toBeVisible({ timeout: 12_000 });
		await compareBtn.click();

		// After toggle the button text flips to "Show Polished"
		const showPolishedBtn = page.locator("button", { hasText: /show polished/i });
		await expect(showPolishedBtn).toBeVisible({ timeout: 5_000 });

		await page.screenshot({
			path: "testsprite_tests/screenshots/video-editor-original-preview.png",
		});
	});
});

test.describe("Video Editor — preview area", () => {
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

	test("Polished Preview badge is visible", async ({ page }) => {
		// VideoEditor renders a badge labelled "Polished Preview" in the video area
		const badge = page.locator("span", { hasText: /polished preview/i });
		await expect(badge).toBeVisible({ timeout: 12_000 });
	});

	test("preview badge switches to Original Preview on toggle", async ({ page }) => {
		const compareBtn = page.locator("button", { hasText: /compare original/i });
		await compareBtn.click();

		const originalBadge = page.locator("span", { hasText: /original preview/i });
		await expect(originalBadge).toBeVisible({ timeout: 5_000 });
	});
});

test.describe("Video Editor — playback controls", () => {
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

	test("Play / Pause button is visible", async ({ page }) => {
		// PlaybackControls renders a button with aria-label "Play" (or "Pause")
		const playBtn = page.locator('[aria-label="Play"]').or(page.locator('[aria-label="Pause"]'));
		await expect(playBtn).toBeVisible({ timeout: 12_000 });
	});

	test("seek slider input is present", async ({ page }) => {
		// PlaybackControls renders an <input type="range"> for seeking
		const seekSlider = page.locator('input[type="range"]').first();
		await expect(seekSlider).toBeAttached({ timeout: 12_000 });
	});

	test("current time display shows 0:00", async ({ page }) => {
		// Time display shows "0:00" when no video is loaded
		const timeDisplay = page
			.locator("span")
			.filter({ hasText: /^0:00$/ })
			.first();
		await expect(timeDisplay).toBeVisible({ timeout: 12_000 });
	});

	test("play button click does not throw", async ({ page }) => {
		const errors: string[] = [];
		page.on("pageerror", (err) => errors.push(err.message));

		const playBtn = page.locator('[aria-label="Play"]').or(page.locator('[aria-label="Pause"]'));
		await expect(playBtn).toBeVisible({ timeout: 12_000 });
		await playBtn.click();

		// Give a moment for any error to surface
		await page.waitForTimeout(500);

		// No unhandled page errors should have fired from the click
		const playbackErrors = errors.filter(
			(e) =>
				!e.includes("electronAPI") &&
				!e.includes("Cannot read properties of null") &&
				!e.includes("network"),
		);
		expect(playbackErrors).toHaveLength(0);

		await page.screenshot({
			path: "testsprite_tests/screenshots/video-editor-play-clicked.png",
		});
	});
});

test.describe("Video Editor — timeline area", () => {
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

	test("timeline panel renders", async ({ page }) => {
		// The timeline panel contains row labels like "Zoom", "Trim", "Captions", "Speed"
		// It is always rendered regardless of whether a video is loaded.
		const timelineArea = page
			.locator("text=Zoom")
			.or(page.locator("text=Trim"))
			.or(page.locator("text=Captions"))
			.first();

		await expect(timelineArea).toBeVisible({ timeout: 12_000 });

		await page.screenshot({
			path: "testsprite_tests/screenshots/video-editor-timeline.png",
		});
	});

	test("Zoom row label is visible in timeline", async ({ page }) => {
		const zoomLabel = page.locator("text=Zoom").first();
		await expect(zoomLabel).toBeVisible({ timeout: 12_000 });
	});

	test("Trim row label is visible in timeline", async ({ page }) => {
		const trimLabel = page.locator("text=Trim").first();
		await expect(trimLabel).toBeVisible({ timeout: 12_000 });
	});

	test("Captions row label is visible in timeline", async ({ page }) => {
		const captionsLabel = page.locator("text=Captions").first();
		await expect(captionsLabel).toBeVisible({ timeout: 12_000 });
	});

	test("Speed row label is visible in timeline", async ({ page }) => {
		const speedLabel = page.locator("text=Speed").first();
		await expect(speedLabel).toBeVisible({ timeout: 12_000 });
	});

	test("Add Zoom button is present", async ({ page }) => {
		// TimelineEditor renders a button or dropdown to add zoom regions
		const addZoomBtn = page
			.locator("button", { hasText: /zoom/i })
			.or(page.locator('[title*="zoom" i]'))
			.first();
		await expect(addZoomBtn).toBeVisible({ timeout: 12_000 });
	});
});

test.describe("Video Editor — settings panel", () => {
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

	test("settings panel renders on the right side", async ({ page }) => {
		// SettingsPanel uses Tabs — look for Appearance, Video, Export tabs
		const appearanceTab = page
			.getByRole("tab", { name: /appearance/i })
			.or(page.locator("text=Appearance"))
			.first();
		await expect(appearanceTab).toBeVisible({ timeout: 12_000 });

		await page.screenshot({
			path: "testsprite_tests/screenshots/video-editor-settings-panel.png",
		});
	});

	test("Export button is present in settings panel", async ({ page }) => {
		// SettingsPanel has an "Export" button / tab
		const exportEl = page
			.locator("button", { hasText: /^export$/i })
			.or(page.getByRole("tab", { name: /export/i }))
			.first();
		await expect(exportEl).toBeVisible({ timeout: 12_000 });
	});
});
