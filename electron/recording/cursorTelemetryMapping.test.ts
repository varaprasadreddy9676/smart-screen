import { describe, expect, it } from "vitest";
import {
	convertNativePointToDip,
	normalizeCursorDipPoint,
	normalizeDipPointWithinDisplay,
	normalizeNativeScreenPoint,
	pickDisplayForTelemetry,
} from "./cursorTelemetryMapping";

const displays = [
	{
		id: 1,
		bounds: { x: 0, y: 0, width: 1440, height: 900 },
		scaleFactor: 2,
		nativeOrigin: { x: 0, y: 0 },
	},
	{
		id: 2,
		bounds: { x: 1440, y: 0, width: 1728, height: 1117 },
		scaleFactor: 2,
		nativeOrigin: { x: 2880, y: 0 },
	},
];

describe("cursorTelemetryMapping", () => {
	it("normalizes DIP points within a display", () => {
		expect(normalizeDipPointWithinDisplay({ x: 720, y: 450 }, displays[0]!)).toEqual({
			cx: 0.5,
			cy: 0.5,
		});
	});

	it("pins screen captures to the selected display", () => {
		const display = pickDisplayForTelemetry({
			pointDip: { x: 1500, y: 100 },
			selectedSource: { id: "screen:1:0", display_id: "1" },
			displays,
			getNearestDisplay: (point) => (point.x < 1440 ? displays[0]! : displays[1]!),
		});

		expect(display.id).toBe(1);
	});

	it("uses the nearest display for window captures", () => {
		const display = pickDisplayForTelemetry({
			pointDip: { x: 1500, y: 100 },
			selectedSource: { id: "window:42:0", display_id: "1" },
			displays,
			getNearestDisplay: (point) => (point.x < 1440 ? displays[0]! : displays[1]!),
		});

		expect(display.id).toBe(2);
	});

	it("converts native physical points to DIP before normalization", () => {
		const normalized = normalizeNativeScreenPoint({
			pointPhysical: { x: 1600, y: 800 },
			selectedSource: { id: "screen:1:0", display_id: "1" },
			displays,
			getNearestDisplay: () => displays[1]!,
			screenToDipPoint: (point) => ({
				x: point.x / 2,
				y: point.y / 2,
			}),
		});

		expect(normalized.cx).toBeCloseTo(800 / 1440, 6);
		expect(normalized.cy).toBeCloseTo(400 / 900, 6);
	});

	it("falls back to display scale-factor conversion when screenToDipPoint is unavailable", () => {
		const pointDip = convertNativePointToDip({ x: 3200, y: 800 }, displays, undefined);
		expect(pointDip).toEqual({ x: 1600, y: 400 });
	});

	it("preserves macOS logical points when the helper already emits DIP coordinates", () => {
		const pointDip = convertNativePointToDip({ x: 800, y: 400 }, displays, undefined);
		expect(pointDip).toEqual({ x: 800, y: 400 });
	});

	it("normalizes cursor DIP points using the nearest display for windows", () => {
		const normalized = normalizeCursorDipPoint({
			pointDip: { x: 1600, y: 300 },
			selectedSource: { id: "window:42:0", display_id: "1" },
			displays,
			getNearestDisplay: () => displays[1]!,
		});

		expect(normalized.cx).toBeCloseTo((1600 - 1440) / 1728, 6);
		expect(normalized.cy).toBeCloseTo(300 / 1117, 6);
	});
});
