import { describe, expect, it } from "vitest";
import type { CursorTelemetryPoint } from "@/components/video-editor/types";
import { detectSilence, getSuggestedTrimRegions } from "./inactivityDetector";

describe("inactivityDetector", () => {
	describe("detectSilence", () => {
		it("should detect periods of no movement >= 3 seconds", () => {
			const telemetry: CursorTelemetryPoint[] = [
				{ cx: 0.1, cy: 0.1, timeMs: 0 },
				{ cx: 0.1, cy: 0.1, timeMs: 1000 },
				{ cx: 0.1, cy: 0.1, timeMs: 2000 },
				{ cx: 0.1, cy: 0.1, timeMs: 3100 }, // Silence for 3100ms
				{ cx: 0.2, cy: 0.2, timeMs: 3500 }, // Move
				{ cx: 0.2, cy: 0.2, timeMs: 4000 },
			];

			const segments = detectSilence(telemetry);
			expect(segments.length).toBe(1);
			expect(segments[0].startMs).toBe(0);
			expect(segments[0].endMs).toBe(3500);
			expect(segments[0].durationMs).toBe(3500); // 3500 - 0 = 3500
		});

		it("should detect multiple silence periods", () => {
			const telemetry: CursorTelemetryPoint[] = [
				{ cx: 0.1, cy: 0.1, timeMs: 0 },
				{ cx: 0.1, cy: 0.1, timeMs: 4000 }, // Silence 1 (4000ms duration)
				{ cx: 0.5, cy: 0.5, timeMs: 4000 }, // Move
				{ cx: 0.5, cy: 0.5, timeMs: 8000 }, // Silence 2 (4000ms duration, 8000 - 4000)
				{ cx: 0.8, cy: 0.8, timeMs: 8000 }, // Move
			];

			const segments = detectSilence(telemetry);
			expect(segments.length).toBe(2);
			expect(segments[0].durationMs).toBe(4000);
			expect(segments[1].durationMs).toBe(4000);
		});

		it("ignores native click markers while measuring silence", () => {
			const telemetry: CursorTelemetryPoint[] = [
				{ cx: 0.1, cy: 0.1, timeMs: 0, kind: "move" },
				{ cx: 0.1, cy: 0.1, timeMs: 1500, kind: "move" },
				{
					cx: 0.1,
					cy: 0.1,
					timeMs: 2000,
					kind: "click",
					button: "left",
					phase: "down",
					source: "native",
				},
				{ cx: 0.1, cy: 0.1, timeMs: 3200, kind: "move" },
				{ cx: 0.2, cy: 0.2, timeMs: 3600, kind: "move" },
			];

			expect(detectSilence(telemetry)).toEqual([
				{
					startMs: 0,
					endMs: 3600,
					durationMs: 3600,
				},
			]);
		});
	});

	describe("getSuggestedTrimRegions", () => {
		it("should filter out silences at the extreme start and end", () => {
			const silences = [
				{ startMs: 0, endMs: 3500, durationMs: 3500 }, // Skipped (startMs < 1000)
				{ startMs: 5000, endMs: 9000, durationMs: 4000 }, // Kept
				{ startMs: 16000, endMs: 20000, durationMs: 4000 }, // Skipped (endMs > 19000, 20s total)
			];

			const suggestions = getSuggestedTrimRegions(silences, 20000);
			expect(suggestions.length).toBe(1);
			expect(suggestions[0].startMs).toBe(5000);
			expect(suggestions[0].endMs).toBe(9000);
		});
	});
});
