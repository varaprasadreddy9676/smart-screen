import { describe, expect, it } from "vitest";
import { DEFAULT_CAPTION_SETTINGS } from "@/components/video-editor/types";
import { buildDemoPolishPlan } from "./polishDemo";

describe("buildDemoPolishPlan", () => {
	it("prefers AI zooms and trims while enabling captions when a transcript exists", () => {
		const plan = buildDemoPolishPlan({
			cursorTelemetry: [
				{ cx: 0.1, cy: 0.1, timeMs: 0 },
				{ cx: 0.2, cy: 0.2, timeMs: 100 },
				{ cx: 0.2, cy: 0.2, timeMs: 200 },
				{ cx: 0.3, cy: 0.3, timeMs: 400 },
			],
			durationMs: 3_000,
			aiSuggestion: {
				summary: "AI result",
				steps: [],
				zooms: [
					{
						id: "ai-zoom-1",
						startMs: 500,
						endMs: 800,
						focus: { cx: 0.6, cy: 0.4 },
						depth: 3,
						reason: "Focus CTA",
					},
				],
				trims: [
					{
						id: "ai-trim-1",
						startMs: 1_000,
						endMs: 1_500,
						reason: "Remove filler",
					},
				],
				speechAnchors: [],
				narrationLinkedZooms: [],
				focusMoments: [],
			},
			transcriptSegments: [
				{
					id: "segment-1",
					startMs: 0,
					endMs: 900,
					text: "Click the call to action button.",
				},
			],
			captionSettings: {
				...DEFAULT_CAPTION_SETTINGS,
				showInPreview: false,
				burnInDuringExport: false,
			},
		});

		expect(plan.zoomSource).toBe("ai");
		expect(plan.trimSource).toBe("ai");
		expect(plan.zoomRegions).toEqual([
			{
				id: "ai-zoom-1",
				startMs: 500,
				endMs: 1200,
				depth: 3,
				focus: { cx: 0.6, cy: 0.4 },
			},
		]);
		expect(plan.trimRegions).toEqual([
			{
				id: "ai-trim-1",
				startMs: 1_000,
				endMs: 1_500,
			},
		]);
		expect(plan.captionSettings.showInPreview).toBe(true);
		expect(plan.captionSettings.burnInDuringExport).toBe(true);
	});

	it("falls back to local smart demo output when AI is unavailable", () => {
		const plan = buildDemoPolishPlan({
			cursorTelemetry: [
				{ cx: 0.1, cy: 0.1, timeMs: 0 },
				{ cx: 0.2, cy: 0.2, timeMs: 100 },
				{ cx: 0.21, cy: 0.21, timeMs: 200 },
				{ cx: 0.21, cy: 0.21, timeMs: 300 },
				{ cx: 0.28, cy: 0.28, timeMs: 400 },
			],
			durationMs: 2_000,
			aiSuggestion: null,
			transcriptSegments: [],
			captionSettings: DEFAULT_CAPTION_SETTINGS,
		});

		expect(plan.zoomSource).toBe("local");
		expect(plan.trimSource).toBe("none");
		expect(plan.zoomRegions).toHaveLength(1);
		expect(plan.annotationRegions).toHaveLength(0);
		expect(plan.captionSettings).toEqual(DEFAULT_CAPTION_SETTINGS);
	});

	it("creates transcript-driven callouts when narration gives a clear instruction", () => {
		const plan = buildDemoPolishPlan({
			cursorTelemetry: [
				{ cx: 0.1, cy: 0.1, timeMs: 0 },
				{ cx: 0.62, cy: 0.22, timeMs: 900, kind: "move" },
				{
					cx: 0.62,
					cy: 0.22,
					timeMs: 1000,
					kind: "click",
					button: "left",
					phase: "down",
					source: "native",
				},
				{
					cx: 0.62,
					cy: 0.22,
					timeMs: 1040,
					kind: "click",
					button: "left",
					phase: "up",
					source: "native",
				},
				{ cx: 0.64, cy: 0.23, timeMs: 1100, kind: "move" },
			],
			durationMs: 3_000,
			aiSuggestion: null,
			transcriptSegments: [
				{
					id: "segment-1",
					startMs: 700,
					endMs: 1300,
					text: "Click the export button",
				},
			],
			captionSettings: DEFAULT_CAPTION_SETTINGS,
		});

		expect(plan.annotationRegions).toHaveLength(1);
		expect(plan.annotationRegions[0]?.content).toBe("Click the export button");
	});
});
