import { describe, expect, it } from "vitest";
import { formatTimestamp, generateSteps } from "./stepGenerator";
import type { DemoSegment } from "./timelineAnalyzer";

describe("stepGenerator", () => {
	describe("generateSteps", () => {
		it("should generate a tutorial step for a click event", () => {
			const segments: DemoSegment[] = [
				{ action: "click", timestamp: 1.5, zoomTarget: [0.1, 0.05] }, // Top-left (menu bar)
			];

			const steps = generateSteps(segments);
			expect(steps.length).toBe(1);
			expect(steps[0].number).toBe(1);
			expect(steps[0].title).toBe("Click the menu bar");
			expect(steps[0].type).toBe("click");
			expect(steps[0].timestamp).toBe(1.5);
		});

		it("should generate a tutorial step for a typing event", () => {
			const segments: DemoSegment[] = [
				{ action: "typing", timestamp: 3.0, endTimestamp: 5.5, zoomTarget: [0.5, 0.5] }, // Center
			];

			const steps = generateSteps(segments);
			expect(steps.length).toBe(1);
			expect(steps[0].number).toBe(1);
			expect(steps[0].title).toBe("Enter text");
			expect(steps[0].description).toContain("Type in the main content area"); // 0.5, 0.5 maps to main content area
			expect(steps[0].description).toContain("3s of input"); // 5.5 - 3.0 = 2.5 -> rounded to 3
		});

		it("should detect repeated clicks in the same area", () => {
			const segments: DemoSegment[] = [
				{ action: "click", timestamp: 1.0, zoomTarget: [0.5, 0.5] },
				{ action: "click", timestamp: 2.0, zoomTarget: [0.52, 0.51] }, // Very close to previous
			];

			const steps = generateSteps(segments);
			expect(steps.length).toBe(2);
			expect(steps[0].title).toBe("Click the main content area"); // 0.5, 0.5 maps to main content area
			expect(steps[1].title).toBe("Continue interaction");
			expect(steps[1].description).toContain("Continue interacting in the main content area");
		});

		it("should ignore navigation and silence segments for tutorial steps", () => {
			const segments: DemoSegment[] = [
				{ action: "click", timestamp: 1.0, zoomTarget: [0.5, 0.5] },
				{ action: "navigation", timestamp: 2.0 }, // Ignored
				{ action: "silence", timestamp: 3.0 }, // Ignored
				{ action: "window-change", timestamp: 4.0, app: "Finder" },
			];

			const steps = generateSteps(segments);
			expect(steps.length).toBe(2);
			expect(steps[0].type).toBe("click");
			expect(steps[0].number).toBe(1);
			expect(steps[1].type).toBe("window-change");
			expect(steps[1].title).toBe("Switch to Finder");
			expect(steps[1].number).toBe(2);
		});
	});

	describe("formatTimestamp", () => {
		it("should format seconds into MM:SS", () => {
			expect(formatTimestamp(0)).toBe("00:00");
			expect(formatTimestamp(5)).toBe("00:05");
			expect(formatTimestamp(65)).toBe("01:05");
			expect(formatTimestamp(120)).toBe("02:00");
			expect(formatTimestamp(3599)).toBe("59:59");
		});
	});
});
