import { describe, expect, it } from "vitest";
import { ZOOM_DEPTH_SCALES, type ZoomRegion } from "../types";
import { findDominantRegion } from "./zoomRegionUtils";

const regions: ZoomRegion[] = [
	{
		id: "zoom-1",
		startMs: 1_000,
		endMs: 1_800,
		depth: 2,
		focus: { cx: 0.2, cy: 0.2 },
	},
	{
		id: "zoom-2",
		startMs: 2_800,
		endMs: 3_500,
		depth: 4,
		focus: { cx: 0.8, cy: 0.75 },
	},
];

describe("zoomRegionUtils", () => {
	it("returns the active region strength during a normal zoom", () => {
		const result = findDominantRegion(regions, 1_400, { connectZooms: false });
		expect(result.region?.id).toBe("zoom-1");
		expect(result.strength).toBeGreaterThan(0.99);
		expect(result.blendedScale).toBeNull();
	});

	it("bridges nearby zooms with a connected pan transition", () => {
		const result = findDominantRegion(regions, 2_100);
		expect(result.region?.id).toBe("zoom-2");
		expect(result.strength).toBe(1);
		expect(result.blendedScale).not.toBeNull();
		expect(result.blendedScale!).toBeGreaterThan(ZOOM_DEPTH_SCALES[2]);
		expect(result.blendedScale!).toBeLessThan(ZOOM_DEPTH_SCALES[4]);
		expect(result.region!.focus.cx).toBeGreaterThan(0.2);
		expect(result.region!.focus.cx).toBeLessThan(0.8);
	});

	it("holds the destination zoom between connected pan end and region start", () => {
		const result = findDominantRegion(regions, 2_700);
		expect(result.region?.id).toBe("zoom-2");
		expect(result.strength).toBe(1);
		expect(result.blendedScale).toBe(ZOOM_DEPTH_SCALES[4]);
		expect(result.region?.focus).toEqual({ cx: 0.8, cy: 0.75 });
	});
});
