import { describe, expect, it } from "vitest";
import type { InteractionEvent } from "./interactionRecorder";
import { analyzeTimeline, getSignificantSegments, getZoomableSegments } from "./timelineAnalyzer";

describe("timelineAnalyzer", () => {
	describe("analyzeTimeline", () => {
		it("should process click events into segments with zoom", () => {
			const events: InteractionEvent[] = [{ type: "click", x: 0.2, y: 0.4, timestamp: 1.0 }];

			const segments = analyzeTimeline(events);
			expect(segments.length).toBe(1);
			expect(segments[0]).toMatchObject({
				action: "click",
				timestamp: 1.0,
				zoomTarget: [0.2, 0.4],
				zoomScale: 1.4,
				label: "Click at (20%, 40%)",
			});
		});

		it("should process typing events into segments with duration", () => {
			const events: InteractionEvent[] = [
				{ type: "typing", x: 0.5, y: 0.5, timestamp: 2.0, duration: 1.5 },
			];

			const segments = analyzeTimeline(events);
			expect(segments.length).toBe(1);
			expect(segments[0]).toMatchObject({
				action: "typing",
				timestamp: 2.0,
				endTimestamp: 3.5,
				zoomTarget: [0.5, 0.5],
				zoomScale: 1.3,
				label: "Typing (1.5s)",
			});
		});

		it("should process window-change events", () => {
			const events: InteractionEvent[] = [
				{ type: "window-change", x: 0.5, y: 0.5, timestamp: 3.0, app: "Chrome" },
			];

			const segments = analyzeTimeline(events);
			expect(segments.length).toBe(1);
			expect(segments[0]).toMatchObject({
				action: "window-change",
				timestamp: 3.0,
				label: "Switch to Chrome",
				app: "Chrome",
			});
		});

		it("should filter out segments that occur too close to each other (MIN_ZOOM_GAP_S)", () => {
			const events: InteractionEvent[] = [
				{ type: "click", x: 0.1, y: 0.1, timestamp: 1.0 },
				{ type: "typing", x: 0.2, y: 0.2, timestamp: 1.2 }, // Only 0.2s after click (dropped)
				{ type: "click", x: 0.3, y: 0.3, timestamp: 2.0 }, // 1.0s after click (kept)
			];

			const segments = analyzeTimeline(events);
			expect(segments.length).toBe(2);
			expect(segments[0].action).toBe("click");
			expect(segments[0].timestamp).toBe(1.0);
			expect(segments[1].action).toBe("click");
			expect(segments[1].timestamp).toBe(2.0);
		});
	});

	describe("getZoomableSegments", () => {
		it("should only return segments with a zoomTarget", () => {
			const segments = analyzeTimeline([
				{ type: "click", x: 0.1, y: 0.1, timestamp: 1.0 },
				{ type: "window-change", x: 0, y: 0, timestamp: 2.0 }, // No zoom
				{ type: "typing", x: 0.2, y: 0.2, timestamp: 3.0, duration: 1 },
			]);

			const zoomable = getZoomableSegments(segments);
			expect(zoomable.length).toBe(2);
			expect(zoomable[0].action).toBe("click");
			expect(zoomable[1].action).toBe("typing");
		});
	});

	describe("getSignificantSegments", () => {
		it("should only return click, typing, and window-change segments", () => {
			const segments = analyzeTimeline([
				{ type: "navigation", x: 0.5, y: 0.5, timestamp: 1.0 }, // Dropped
				{ type: "click", x: 0.1, y: 0.1, timestamp: 2.0 }, // Kept
				{ type: "window-change", x: 0.5, y: 0.5, timestamp: 3.0 }, // Kept
			]);

			const significant = getSignificantSegments(segments);
			expect(significant.length).toBe(2);
			expect(significant[0].action).toBe("click");
			expect(significant[1].action).toBe("window-change");
		});
	});
});
