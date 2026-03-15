import { describe, expect, it } from "vitest";
import {
	ANNOTATION_ROW_ID,
	buildTimelineItems,
	buildTimelineRegionSpans,
	filterTimelineItemsByRange,
	getVisibleTimelineOverscanMs,
	partitionTimelineItems,
	SPEED_ROW_ID,
	TRIM_ROW_ID,
	ZOOM_ROW_ID,
} from "./timelineModel";

describe("timelineModel", () => {
	it("builds timeline items with row-specific labels", () => {
		const items = buildTimelineItems({
			zoomRegions: [{ id: "z1", startMs: 0, endMs: 500, depth: 2, focus: { cx: 0.5, cy: 0.5 } }],
			trimRegions: [{ id: "t1", startMs: 600, endMs: 900 }],
			annotationRegions: [
				{
					id: "a1",
					startMs: 950,
					endMs: 1200,
					type: "text",
					content: "Open export settings panel",
					position: { x: 10, y: 10 },
					size: { width: 20, height: 10 },
					style: {
						color: "#fff",
						backgroundColor: "transparent",
						fontSize: 14,
						fontFamily: "Inter",
						fontWeight: "bold",
						fontStyle: "normal",
						textDecoration: "none",
						textAlign: "left",
					},
					zIndex: 1,
				},
			],
			speedRegions: [{ id: "s1", startMs: 1300, endMs: 2000, speed: 1.5 }],
		});

		expect(items.map((item) => [item.id, item.rowId, item.label])).toEqual([
			["z1", ZOOM_ROW_ID, "Zoom 1"],
			["t1", TRIM_ROW_ID, "Trim 1"],
			["a1", ANNOTATION_ROW_ID, "Open export settings..."],
			["s1", SPEED_ROW_ID, "Speed 1"],
		]);
	});

	it("builds overlap spans only for non-annotation regions", () => {
		expect(
			buildTimelineRegionSpans({
				zoomRegions: [{ id: "z1", startMs: 0, endMs: 500, depth: 2, focus: { cx: 0.5, cy: 0.5 } }],
				trimRegions: [{ id: "t1", startMs: 600, endMs: 900 }],
				speedRegions: [{ id: "s1", startMs: 1300, endMs: 2000, speed: 1.5 }],
			}),
		).toEqual([
			{ id: "z1", start: 0, end: 500 },
			{ id: "t1", start: 600, end: 900 },
			{ id: "s1", start: 1300, end: 2000 },
		]);
	});

	it("filters timeline items by visible range with overscan", () => {
		const items = [
			{
				id: "near-left",
				rowId: ZOOM_ROW_ID,
				span: { start: 600, end: 900 },
				label: "",
				variant: "zoom" as const,
			},
			{
				id: "visible",
				rowId: ZOOM_ROW_ID,
				span: { start: 2500, end: 3000 },
				label: "",
				variant: "zoom" as const,
			},
			{
				id: "far-right",
				rowId: ZOOM_ROW_ID,
				span: { start: 9000, end: 9500 },
				label: "",
				variant: "zoom" as const,
			},
		];

		expect(
			filterTimelineItemsByRange(items, { start: 2000, end: 4000 }).map((item) => item.id),
		).toEqual(["near-left", "visible"]);
	});

	it("partitions items by row for rendering", () => {
		const partitioned = partitionTimelineItems([
			{ id: "z1", rowId: ZOOM_ROW_ID, span: { start: 0, end: 1 }, label: "", variant: "zoom" },
			{ id: "t1", rowId: TRIM_ROW_ID, span: { start: 0, end: 1 }, label: "", variant: "trim" },
			{
				id: "a1",
				rowId: ANNOTATION_ROW_ID,
				span: { start: 0, end: 1 },
				label: "",
				variant: "annotation",
			},
			{ id: "s1", rowId: SPEED_ROW_ID, span: { start: 0, end: 1 }, label: "", variant: "speed" },
		]);

		expect(partitioned.zoomItems).toHaveLength(1);
		expect(partitioned.trimItems).toHaveLength(1);
		expect(partitioned.annotationItems).toHaveLength(1);
		expect(partitioned.speedItems).toHaveLength(1);
	});

	it("scales visible overscan with the current range", () => {
		expect(getVisibleTimelineOverscanMs({ start: 0, end: 1000 })).toBe(1200);
		expect(getVisibleTimelineOverscanMs({ start: 0, end: 30000 })).toBe(6000);
	});
});
