import { describe, expect, it } from "vitest";
import { buildAutoZoomRegions } from "./autoZoom";

describe("autoZoom", () => {
	it("creates restrained click-centric zooms with a small pre-roll", () => {
		const regions = buildAutoZoomRegions([
			{
				action: "click",
				timestamp: 2,
				zoomTarget: [0.4, 0.6],
			},
		]);

		expect(regions).toEqual([
			{
				id: "smart-zoom-1",
				startMs: 1910,
				endMs: 2310,
				depth: 1,
				focus: { cx: 0.4, cy: 0.6 },
			},
		]);
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
		expect(regions[0]?.startMs).toBe(910);
		expect(regions[0]?.endMs).toBe(1830);
		expect(regions[0]?.depth).toBe(2);
	});

	it("skips rapid reframes across the screen to avoid constant breathing", () => {
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
});
