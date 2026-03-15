import {
	applySmartDemoAISuggestion,
	isAIManagedRegionId,
	mapAISuggestionTrimRegions,
	mapAISuggestionZoomRegions,
} from "./applySmartDemoAISuggestion";

describe("applySmartDemoAISuggestion", () => {
	it("maps AI suggestions into editor zoom and trim regions", () => {
		const suggestion = {
			summary: "Concise path",
			steps: [],
			zooms: [
				{
					id: "ai-zoom-1",
					startMs: 100,
					endMs: 600,
					focus: { cx: 0.25, cy: 0.75 },
					depth: 3,
					reason: "Focus input field",
				},
			],
			trims: [
				{
					id: "ai-trim-1",
					startMs: 1000,
					endMs: 1800,
					reason: "Idle wait",
				},
			],
			speechAnchors: [],
			narrationLinkedZooms: [
				{
					id: "ai-narration-zoom-1",
					startMs: 650,
					endMs: 900,
					focus: { cx: 0.7, cy: 0.4 },
					depth: 2,
					reason: "Narration references chart",
					anchorId: "ai-anchor-1",
				},
			],
			focusMoments: [],
		};
		const mapped = applySmartDemoAISuggestion(suggestion);

		expect(mapped).toEqual({
			zoomRegions: [
				{
					id: "ai-zoom-1",
					startMs: 100,
					endMs: 800,
					depth: 3,
					focus: { cx: 0.25, cy: 0.75 },
				},
				{
					id: "ai-narration-zoom-1",
					startMs: 650,
					endMs: 1350,
					depth: 2,
					focus: { cx: 0.7, cy: 0.4 },
				},
			],
			trimRegions: [
				{
					id: "ai-trim-1",
					startMs: 1000,
					endMs: 1800,
				},
			],
		});
		expect(mapAISuggestionZoomRegions(suggestion)).toEqual(mapped.zoomRegions);
		expect(mapAISuggestionTrimRegions(suggestion)).toEqual(mapped.trimRegions);
	});

	it("normalizes AI zoom regions into a visible, sorted timeline order", () => {
		const suggestion = {
			summary: "Concise path",
			steps: [],
			zooms: [
				{
					id: "ai-zoom-late",
					startMs: 900,
					endMs: 1000,
					focus: { cx: 1.5, cy: -0.2 },
					depth: 2,
					reason: "Late zoom",
				},
			],
			trims: [],
			speechAnchors: [],
			narrationLinkedZooms: [
				{
					id: "ai-zoom-early",
					startMs: 100,
					endMs: 200,
					focus: { cx: 0.1, cy: 0.2 },
					depth: 3,
					reason: "Early zoom",
					anchorId: "anchor-1",
				},
			],
			focusMoments: [],
		};

		expect(mapAISuggestionZoomRegions(suggestion)).toEqual([
			{
				id: "ai-zoom-early",
				startMs: 100,
				endMs: 800,
				depth: 3,
				focus: { cx: 0.1, cy: 0.2 },
			},
			{
				id: "ai-zoom-late",
				startMs: 900,
				endMs: 1600,
				depth: 2,
				focus: { cx: 1, cy: 0 },
			},
		]);
	});

	it("caps overly long AI zoom regions so the whole demo does not stay zoomed", () => {
		const suggestion = {
			summary: "Concise path",
			steps: [],
			zooms: [
				{
					id: "ai-zoom-long",
					startMs: 1000,
					endMs: 6000,
					focus: { cx: 0.4, cy: 0.5 },
					depth: 2,
					reason: "Overly long focus",
				},
			],
			trims: [],
			speechAnchors: [],
			narrationLinkedZooms: [],
			focusMoments: [],
		};

		expect(mapAISuggestionZoomRegions(suggestion)).toEqual([
			{
				id: "ai-zoom-long",
				startMs: 1000,
				endMs: 2400,
				depth: 2,
				focus: { cx: 0.4, cy: 0.5 },
			},
		]);
	});

	it("recognizes AI-managed region IDs", () => {
		expect(isAIManagedRegionId("ai-zoom-1")).toBe(true);
		expect(isAIManagedRegionId("smart-zoom-1")).toBe(false);
	});
});
