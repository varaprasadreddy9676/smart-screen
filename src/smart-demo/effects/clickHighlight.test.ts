import { describe, expect, it } from "vitest";
import { buildClickHighlights } from "./clickHighlight";

describe("clickHighlight", () => {
	it("builds transcript-driven callouts near matched click targets", () => {
		const annotations = buildClickHighlights(
			[
				{ action: "click", timestamp: 1.6, zoomTarget: [0.82, 0.18] },
				{ action: "click", timestamp: 4.1, zoomTarget: [0.32, 0.58] },
			],
			{
				transcriptSegments: [
					{
						id: "t1",
						startMs: 1200,
						endMs: 1900,
						text: "Now click the export button",
					},
					{
						id: "t2",
						startMs: 3800,
						endMs: 4300,
						text: "Look at this chart",
					},
				],
			},
		);

		expect(annotations).toHaveLength(2);
		expect(annotations[0]?.content).toBe("Click the export button");
		expect(annotations[0]?.position.x).toBeLessThan(82);
		expect(annotations[0]?.position.y).toBeGreaterThan(18);
		expect(annotations[1]?.content).toBe("Look at this chart");
	});

	it("returns no generic click circles when narration is unavailable", () => {
		const annotations = buildClickHighlights([
			{ action: "click", timestamp: 1.2, zoomTarget: [0.5, 0.5] },
		]);

		expect(annotations).toEqual([]);
	});
});
