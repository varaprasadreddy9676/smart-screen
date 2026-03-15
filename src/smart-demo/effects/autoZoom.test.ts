import { describe, expect, it } from "vitest";
import { buildAutoZoomRegions } from "./autoZoom";

// Timing constants mirrored from autoZoom.ts for readable expectations.
const PRE_ROLL = 150;
const POST_ROLL = 500;
const MIN_DURATION = 650;
const MAX_DURATION = 950;

describe("autoZoom", () => {
	it("creates a zoom with a pre-roll that reaches full strength (hold period exists)", () => {
		// With PRE_ROLL=150, POST_ROLL=500:
		//   startMs = 2000 - 150 = 1850
		//   rawEndMs = 2000 + 500 = 2500
		//   rawEndMs - startMs = 650ms (equals MIN_DURATION) → endMs = 1850 + 650 = 2500
		//   zoomInEnd = 1850 + 420 = 2270ms  →  hold period: 2270–2500ms (230ms) ✓
		const regions = buildAutoZoomRegions([
			{
				action: "click",
				timestamp: 2,
				zoomTarget: [0.4, 0.6],
			},
		]);

		expect(regions).toHaveLength(1);
		expect(regions[0]).toMatchObject({
			id: "smart-zoom-1",
			startMs: 2000 - PRE_ROLL,
			endMs: 2000 - PRE_ROLL + MIN_DURATION,
			depth: 1, // heuristic click (no source) → depth 1
			focus: { cx: 0.4, cy: 0.6 },
		});
	});

	it("gives native clicks depth 2 for a more visible zoom", () => {
		const regions = buildAutoZoomRegions([
			{
				action: "click",
				timestamp: 2,
				zoomTarget: [0.4, 0.6],
				source: "native",
			},
		]);

		expect(regions).toHaveLength(1);
		expect(regions[0]?.depth).toBe(2);
	});

	it("does not merge nearby clicks when they target different parts of the screen", () => {
		const regions = buildAutoZoomRegions([
			{
				action: "click",
				timestamp: 1,
				zoomTarget: [0.2, 0.2],
			},
			{
				action: "click",
				timestamp: 2.6,
				zoomTarget: [0.8, 0.75],
			},
		]);

		expect(regions).toHaveLength(2);
		expect(regions[0]?.focus).toEqual({ cx: 0.2, cy: 0.2 });
		expect(regions[1]?.focus).toEqual({ cx: 0.8, cy: 0.75 });
	});

	it("merges repeated clicks on the same target into one stable shot", () => {
		// startMs = 1000 - 150 = 850
		// rawEndMs = 1600 + 500 = 2100
		// rawEndMs - startMs = 1250ms > MAX_DURATION_CLUSTER=1200 → endMs = 850 + 1200 = 2050
		const regions = buildAutoZoomRegions([
			{
				action: "click",
				timestamp: 1,
				zoomTarget: [0.52, 0.48],
			},
			{
				action: "click",
				timestamp: 1.6,
				zoomTarget: [0.53, 0.49],
			},
		]);

		expect(regions).toHaveLength(1);
		expect(regions[0]?.startMs).toBe(850);
		expect(regions[0]?.endMs).toBe(2050);
		expect(regions[0]?.depth).toBe(2); // cluster → depth 2
	});

	it("skips rapid reframes across the screen to avoid constant breathing", () => {
		// Click 1 at t=1s (0.2,0.2) → candidate 1
		// Click 2 at t=1.45s (0.82,0.78) → distance=0.85 > cluster threshold → new candidate
		//   But gapMs = candidate2.startMs - candidate1.endMs
		//   candidate2.startMs = 1450-150=1300, candidate1.endMs = 850+650=1500
		//   gapMs = -200ms < MIN_REFRAME_GAP (700ms) → skip
		// Click 3 at t=2.7s (0.84,0.79) → gap from candidate1.endMs = 2550-1500=1050ms > 700 → include
		const regions = buildAutoZoomRegions([
			{
				action: "click",
				timestamp: 1,
				zoomTarget: [0.2, 0.2],
			},
			{
				action: "click",
				timestamp: 1.45,
				zoomTarget: [0.82, 0.78],
			},
			{
				action: "click",
				timestamp: 2.7,
				zoomTarget: [0.84, 0.79],
			},
		]);

		expect(regions).toHaveLength(2);
		expect(regions[0]?.focus).toEqual({ cx: 0.2, cy: 0.2 });
		expect(regions[1]?.focus).toEqual({ cx: 0.84, cy: 0.79 });
	});

	it("native clicks override gap suppression when far enough apart", () => {
		// Two native clicks 0.8s apart to very different screen areas.
		// Without native override: gapMs < 700ms → second would be suppressed.
		// With native override: focusDistance > 0.18 AND source=native → both zoom.
		const regions = buildAutoZoomRegions([
			{
				action: "click",
				timestamp: 1,
				zoomTarget: [0.1, 0.1],
				source: "native",
			},
			{
				action: "click",
				timestamp: 1.8,
				zoomTarget: [0.9, 0.9],
				source: "native",
			},
		]);

		expect(regions).toHaveLength(2);
		expect(regions[0]?.focus).toEqual({ cx: 0.1, cy: 0.1 });
		expect(regions[1]?.focus).toEqual({ cx: 0.9, cy: 0.9 });
	});

	it("heuristic clicks within 700ms gap are still suppressed", () => {
		// Use positions well away from edge margin (0.1) so confidence isn't penalized.
		const regions = buildAutoZoomRegions([
			{
				action: "click",
				timestamp: 1,
				zoomTarget: [0.2, 0.3],
				source: "heuristic",
			},
			{
				action: "click",
				timestamp: 1.6,
				zoomTarget: [0.85, 0.85],
				source: "heuristic",
			},
		]);

		// gapMs = candidate2.startMs - candidate1.endMs
		// candidate1: startMs=850, endMs=850+650=1500
		// candidate2: startMs=1450
		// gapMs = 1450-1500 = -50ms < 700ms → suppress candidate2
		expect(regions).toHaveLength(1);
		expect(regions[0]?.focus).toEqual({ cx: 0.2, cy: 0.3 });
	});

	it("handles empty segments gracefully", () => {
		expect(buildAutoZoomRegions([])).toEqual([]);
	});

	it("ignores segments without zoom targets", () => {
		const regions = buildAutoZoomRegions([
			{ action: "window-change", timestamp: 1 },
			{ action: "navigation", timestamp: 2 },
		]);
		expect(regions).toEqual([]);
	});
});
