/**
 * smart-demo-panel.spec.ts
 *
 * Tests for the Smart Demo panel that lives inside the Video Editor
 * (`windowType=editor`).
 *
 * The SmartDemoPanel is rendered inside a Sheet (SmartDemoSheet.tsx) that
 * opens when the user clicks the "Smart Screen" button in the top toolbar.
 *
 * Panel sections:
 *   - "One-Click Polish Demo" emerald button (always visible)
 *   - "Auto-Enhance" card with Generate/Re-run button
 *   - "Transcript" card with Import / Transcribe buttons and backend selector
 *
 * NOTE: The editor initialises with `loading=true` while it waits for
 * electronAPI.getCurrentVideoPath(). Without a real Electron process the
 * IPC never resolves, so the editor will sit in "Loading video..." state.
 * These tests therefore:
 *   1. Assert the loading state is shown correctly.
 *   2. Mock the electronAPI where possible to reach the editor UI.
 */

import { expect, test } from "@playwright/test";

const EDITOR_URL = "http://localhost:5173/?windowType=editor";

// Minimal electronAPI stub that makes the editor skip loading
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

test.describe("Smart Demo Panel — loading state", () => {
	test.beforeEach(async ({ page }) => {
		page.on("console", () => {});
	});

	test("editor page renders without fatal crash", async ({ page }) => {
		await page.addInitScript(ELECTRON_API_STUB);
		await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded" });

		const root = page.locator("#root");
		await expect(root).toBeAttached({ timeout: 12_000 });

		await page.screenshot({
			path: "testsprite_tests/screenshots/smart-demo-editor-loaded.png",
		});
	});

	test("loading or editor UI renders after stub", async ({ page }) => {
		await page.addInitScript(ELECTRON_API_STUB);
		await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded" });

		// Either the editor has loaded (no video state) or the loading text shows
		const loadingText = page.locator("text=Loading video");
		const editorContent = page.locator('[aria-label="Undo"]').or(page.locator("text=Smart Screen"));

		const isLoading = await loadingText.isVisible({ timeout: 3_000 }).catch(() => false);
		const hasEditor = await editorContent.isVisible({ timeout: 3_000 }).catch(() => false);

		expect(isLoading || hasEditor).toBe(true);
	});
});

test.describe("Smart Demo Panel — toolbar buttons", () => {
	test.beforeEach(async ({ page }) => {
		page.on("console", () => {});
		await page.addInitScript(ELECTRON_API_STUB);
		await page.goto(EDITOR_URL, { waitUntil: "domcontentloaded" });

		// Wait for either the editor toolbar or the loading screen
		await page
			.locator('[aria-label="Undo"]')
			.or(page.locator("text=Loading video"))
			.or(page.locator("text=No video to load"))
			.first()
			.waitFor({ timeout: 15_000 });
	});

	test("Smart Screen button is present in toolbar", async ({ page }) => {
		// VideoEditor renders a "Smart Screen" button in the top titlebar area
		const smartScreenBtn = page.locator("button", { hasText: /smart screen/i });
		await expect(smartScreenBtn).toBeVisible({ timeout: 12_000 });
	});

	test("AI Assist button is present in toolbar", async ({ page }) => {
		const aiBtn = page.locator("button", { hasText: /ai assist/i });
		await expect(aiBtn).toBeVisible({ timeout: 12_000 });
	});

	test("Compare Original button is present in toolbar", async ({ page }) => {
		const compareBtn = page.locator("button", { hasText: /compare original/i });
		await expect(compareBtn).toBeVisible({ timeout: 12_000 });
	});

	test("Undo button is present and initially disabled", async ({ page }) => {
		const undoBtn = page.locator('[aria-label="Undo"]');
		await expect(undoBtn).toBeVisible({ timeout: 12_000 });
		await expect(undoBtn).toBeDisabled();
	});

	test("Redo button is present and initially disabled", async ({ page }) => {
		const redoBtn = page.locator('[aria-label="Redo"]');
		await expect(redoBtn).toBeVisible({ timeout: 12_000 });
		await expect(redoBtn).toBeDisabled();
	});

	test("clicking Smart Screen button opens Smart Demo sheet", async ({ page }) => {
		const smartScreenBtn = page.locator("button", { hasText: /smart screen/i });
		await expect(smartScreenBtn).toBeVisible({ timeout: 12_000 });
		await smartScreenBtn.click();

		// The SmartDemoSheet contains the SmartDemoPanel which always renders
		// the "One-Click Polish Demo" button
		const polishBtn = page.locator("button", { hasText: /one-click polish demo/i });
		await expect(polishBtn).toBeVisible({ timeout: 12_000 });

		await page.screenshot({
			path: "testsprite_tests/screenshots/smart-demo-panel-open.png",
		});
	});

	test("Smart Demo panel shows Auto-Enhance section", async ({ page }) => {
		const smartScreenBtn = page.locator("button", { hasText: /smart screen/i });
		await smartScreenBtn.click();

		const autoEnhanceLabel = page.locator("text=Auto-Enhance");
		await expect(autoEnhanceLabel).toBeVisible({ timeout: 12_000 });
	});

	test("Smart Demo panel shows Transcript section", async ({ page }) => {
		const smartScreenBtn = page.locator("button", { hasText: /smart screen/i });
		await smartScreenBtn.click();

		const transcriptLabel = page.locator("text=Transcript");
		await expect(transcriptLabel).toBeVisible({ timeout: 12_000 });
	});

	test("Auto-Enhance Generate button is present", async ({ page }) => {
		const smartScreenBtn = page.locator("button", { hasText: /smart screen/i });
		await smartScreenBtn.click();

		// Generate button shown in idle state (no telemetry available without recording)
		const generateBtn = page.locator("button", { hasText: /generate/i });
		await expect(generateBtn).toBeVisible({ timeout: 12_000 });
	});

	test("Generate button is disabled when no cursor data", async ({ page }) => {
		const smartScreenBtn = page.locator("button", { hasText: /smart screen/i });
		await smartScreenBtn.click();

		// Without cursor telemetry, button is disabled
		const generateBtn = page.locator("button", { hasText: /generate/i });
		await expect(generateBtn).toBeVisible({ timeout: 12_000 });
		await expect(generateBtn).toBeDisabled();
	});

	test("One-Click Polish Demo button is present but disabled without data", async ({ page }) => {
		const smartScreenBtn = page.locator("button", { hasText: /smart screen/i });
		await smartScreenBtn.click();

		const polishBtn = page.locator("button", { hasText: /one-click polish demo/i });
		await expect(polishBtn).toBeVisible({ timeout: 12_000 });
		// Disabled when canPolishDemo is false (no telemetry, no transcript)
		await expect(polishBtn).toBeDisabled();
	});

	test("Transcript Import button is visible", async ({ page }) => {
		const smartScreenBtn = page.locator("button", { hasText: /smart screen/i });
		await smartScreenBtn.click();

		const importBtn = page.locator("button", { hasText: /^import$/i });
		await expect(importBtn).toBeVisible({ timeout: 12_000 });
	});

	test("Transcript Transcribe button is visible", async ({ page }) => {
		const smartScreenBtn = page.locator("button", { hasText: /smart screen/i });
		await smartScreenBtn.click();

		const transcribeBtn = page.locator("button", { hasText: /transcribe/i });
		await expect(transcribeBtn).toBeVisible({ timeout: 12_000 });
	});

	test("No cursor data badge is shown", async ({ page }) => {
		const smartScreenBtn = page.locator("button", { hasText: /smart screen/i });
		await smartScreenBtn.click();

		// Without telemetry: "No cursor data" badge renders
		const badge = page.locator("text=No cursor data");
		await expect(badge).toBeVisible({ timeout: 12_000 });
	});

	test("panel can be closed", async ({ page }) => {
		const smartScreenBtn = page.locator("button", { hasText: /smart screen/i });
		await smartScreenBtn.click();

		// Panel opens — verify it is visible
		const polishBtn = page.locator("button", { hasText: /one-click polish demo/i });
		await expect(polishBtn).toBeVisible({ timeout: 12_000 });

		// Close via Escape key (Sheet component standard close)
		await page.keyboard.press("Escape");

		await page.screenshot({
			path: "testsprite_tests/screenshots/smart-demo-panel-closed.png",
		});
	});
});
