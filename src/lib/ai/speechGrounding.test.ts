import type { TranscriptSegment } from "@shared/ai";
import type { CursorTelemetryPoint } from "@/components/video-editor/types";
import { analyzeSpeechGrounding } from "./speechGrounding";

describe("analyzeSpeechGrounding", () => {
	it("creates local speech anchors and narration-linked zooms from directive transcript text", () => {
		const transcriptSegments: TranscriptSegment[] = [
			{
				id: "transcript-1",
				startMs: 1000,
				endMs: 1800,
				text: "Now click this button",
				confidence: 0.8,
			},
		];
		const cursorTelemetry: CursorTelemetryPoint[] = [
			{ timeMs: 1200, cx: 0.65, cy: 0.35 },
			{ timeMs: 1400, cx: 0.66, cy: 0.36 },
		];

		const result = analyzeSpeechGrounding({
			transcriptSegments,
			cursorTelemetry,
			durationMs: 3000,
		});

		expect(result.warnings).toEqual([]);
		expect(result.speechAnchors).toEqual([
			expect.objectContaining({
				id: "local-anchor-1",
				referencedTarget: "Button",
			}),
		]);
		expect(result.narrationLinkedZooms).toEqual([
			expect.objectContaining({
				id: "local-narration-zoom-1",
				anchorId: "local-anchor-1",
				focus: { cx: 0.65, cy: 0.35 },
			}),
		]);
		expect(result.focusMoments).toEqual([
			expect.objectContaining({
				id: "local-focus-1",
				anchorId: "local-anchor-1",
			}),
		]);
	});

	it("emits transcript/video mismatch warnings", () => {
		const transcriptSegments: TranscriptSegment[] = [
			{
				id: "transcript-1",
				startMs: 7000,
				endMs: 8200,
				text: "Look at this chart",
				confidence: 0.2,
			},
		];

		const result = analyzeSpeechGrounding({
			transcriptSegments,
			cursorTelemetry: [],
			durationMs: 4000,
		});

		expect(result.warnings.map((warning) => warning.message)).toEqual(
			expect.arrayContaining([
				expect.stringContaining("extends past the video duration"),
				expect.stringContaining("starts unusually late"),
				expect.stringContaining("low confidence"),
				expect.stringContaining("could not be matched to nearby cursor motion"),
			]),
		);
	});
});
