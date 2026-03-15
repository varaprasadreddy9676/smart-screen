import { describe, expect, it } from "vitest";
import type { CursorTelemetryPoint } from "@/components/video-editor/types";
import { analyzeInteractions } from "./interactionRecorder";

describe("interactionRecorder", () => {
	it("should return empty array for less than 3 telemetry points", () => {
		expect(analyzeInteractions([])).toEqual([]);
		expect(analyzeInteractions([{ cx: 0, cy: 0, timeMs: 0 } as CursorTelemetryPoint])).toEqual([]);
	});

	it("should detect a window-change event for large instantaneous jumps", () => {
		const telemetry: CursorTelemetryPoint[] = [
			{ cx: 0.1, cy: 0.1, timeMs: 0 },
			{ cx: 0.1, cy: 0.1, timeMs: 100 },
			{ cx: 0.8, cy: 0.8, timeMs: 200 }, // > 0.6 distance
			{ cx: 0.8, cy: 0.8, timeMs: 300 },
		];

		const events = analyzeInteractions(telemetry);
		expect(events.length).toBe(1);
		expect(events[0].type).toBe("window-change");
		expect(events[0].x).toBe(0.8);
		expect(events[0].y).toBe(0.8);
		expect(events[0].timestamp).toBe(0.2);
	});

	it("should detect a click event via dwell pattern", () => {
		const telemetry: CursorTelemetryPoint[] = [
			// Moving
			{ cx: 0.1, cy: 0.1, timeMs: 0 },
			{ cx: 0.2, cy: 0.2, timeMs: 100 },
			// Dwell for 300ms (within 150-800ms)
			{ cx: 0.3, cy: 0.3, timeMs: 200 },
			{ cx: 0.3, cy: 0.3, timeMs: 300 },
			{ cx: 0.3, cy: 0.3, timeMs: 400 },
			{ cx: 0.3, cy: 0.3, timeMs: 500 },
			// Moving again
			{ cx: 0.4, cy: 0.4, timeMs: 600 },
		];

		const events = analyzeInteractions(telemetry);
		expect(events.length).toBe(1);
		expect(events[0].type).toBe("click");
		expect(events[0].x).toBe(0.3);
		expect(events[0].y).toBe(0.3);
		// Timestamp corresponds to the start of the dwell
		expect(events[0].timestamp).toBe(0.2);
	});

	it("detects shorter practical click dwells from 10Hz telemetry", () => {
		const telemetry: CursorTelemetryPoint[] = [
			{ cx: 0.1, cy: 0.1, timeMs: 0 },
			{ cx: 0.18, cy: 0.18, timeMs: 100 },
			{ cx: 0.21, cy: 0.21, timeMs: 200 },
			{ cx: 0.21, cy: 0.21, timeMs: 300 },
			{ cx: 0.28, cy: 0.28, timeMs: 400 },
		];

		const events = analyzeInteractions(telemetry);
		expect(events).toEqual([
			{
				type: "click",
				x: 0.21,
				y: 0.21,
				timestamp: 0.2,
				source: "heuristic",
			},
		]);
	});

	it("prefers explicit native click telemetry when present", () => {
		const telemetry: CursorTelemetryPoint[] = [
			{ cx: 0.1, cy: 0.1, timeMs: 0, kind: "move" },
			{ cx: 0.2, cy: 0.2, timeMs: 100, kind: "move" },
			{
				cx: 0.22,
				cy: 0.24,
				timeMs: 220,
				kind: "click",
				button: "left",
				phase: "down",
				source: "native",
			},
			{ cx: 0.22, cy: 0.24, timeMs: 300, kind: "move" },
			{ cx: 0.28, cy: 0.3, timeMs: 450, kind: "move" },
		];

		expect(analyzeInteractions(telemetry)).toEqual([
			{
				type: "click",
				x: 0.22,
				y: 0.24,
				timestamp: 0.22,
				source: "native",
			},
		]);
	});

	it("detects clicks when the cursor eases into position before dwelling", () => {
		const telemetry: CursorTelemetryPoint[] = [
			{ cx: 0.1, cy: 0.1, timeMs: 0 },
			{ cx: 0.18, cy: 0.18, timeMs: 100 },
			{ cx: 0.205, cy: 0.205, timeMs: 200 },
			{ cx: 0.21, cy: 0.21, timeMs: 300 },
			{ cx: 0.21, cy: 0.21, timeMs: 400 },
			{ cx: 0.21, cy: 0.21, timeMs: 500 },
			{ cx: 0.215, cy: 0.215, timeMs: 600 },
			{ cx: 0.3, cy: 0.3, timeMs: 700 },
		];

		const events = analyzeInteractions(telemetry);
		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({
			type: "click",
			timestamp: 0.2,
		});
		expect(events[0]?.x).toBeCloseTo(0.21, 6);
		expect(events[0]?.y).toBeCloseTo(0.21, 6);
	});

	it("should detect a typing event via prolonged stillness", () => {
		const telemetry: CursorTelemetryPoint[] = [
			// Move into position
			{ cx: 0.5, cy: 0.5, timeMs: 0 },
			{ cx: 0.5, cy: 0.5, timeMs: 100 },
			// Still for 1200ms (> 1000ms threshold)
			{ cx: 0.5, cy: 0.5, timeMs: 200 },
			{ cx: 0.5, cy: 0.5, timeMs: 500 },
			{ cx: 0.5, cy: 0.5, timeMs: 1000 },
			{ cx: 0.5, cy: 0.5, timeMs: 1400 },
			// Resume movement
			{ cx: 0.6, cy: 0.6, timeMs: 1500 },
		];

		const events = analyzeInteractions(telemetry);
		expect(events.length).toBe(1);
		expect(events[0].type).toBe("typing");
		expect(events[0].x).toBe(0.5);
		expect(events[0].y).toBe(0.5);
		expect(events[0].timestamp).toBe(0);
		expect(events[0].duration).toBe(1.4);
	});

	it("does not treat long stationary typing runs as clicks", () => {
		const telemetry: CursorTelemetryPoint[] = [
			{ cx: 0.5, cy: 0.5, timeMs: 0 },
			{ cx: 0.5, cy: 0.5, timeMs: 200 },
			{ cx: 0.5, cy: 0.5, timeMs: 700 },
			{ cx: 0.5, cy: 0.5, timeMs: 1200 },
			{ cx: 0.5, cy: 0.5, timeMs: 1700 },
			{ cx: 0.6, cy: 0.6, timeMs: 1800 },
		];

		const events = analyzeInteractions(telemetry);
		expect(events).toHaveLength(1);
		expect(events[0]?.type).toBe("typing");
	});

	it("should deduplicate events occurring within 300ms", () => {
		const telemetry: CursorTelemetryPoint[] = [
			{ cx: 0.1, cy: 0.1, timeMs: 0 },
			{ cx: 0.2, cy: 0.2, timeMs: 100 },
			// Click 1
			{ cx: 0.3, cy: 0.3, timeMs: 200 },
			{ cx: 0.3, cy: 0.3, timeMs: 400 }, // 200ms dwell
			// Move
			{ cx: 0.35, cy: 0.35, timeMs: 450 },
			// Click 2 (too close, timestamp 0.5s is within 0.3s of 0.2s)
			{ cx: 0.4, cy: 0.4, timeMs: 460 },
			{ cx: 0.4, cy: 0.4, timeMs: 660 }, // 200ms dwell
			// Move
			{ cx: 0.5, cy: 0.5, timeMs: 900 },
		];

		const events = analyzeInteractions(telemetry);
		expect(events.length).toBe(1);
		expect(events[0].type).toBe("click");
		expect(events[0].timestamp).toBe(0.2);
	});
});
