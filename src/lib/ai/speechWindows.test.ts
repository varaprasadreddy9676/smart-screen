import type { TranscriptSegment } from "@shared/ai";
import { buildSpeechWindows } from "./speechWindows";

describe("buildSpeechWindows", () => {
	it("groups nearby transcript segments into speech windows", () => {
		const segments: TranscriptSegment[] = [
			{
				id: "transcript-1",
				startMs: 0,
				endMs: 900,
				text: "Open the dashboard",
				speaker: "Narrator",
				confidence: 0.8,
			},
			{
				id: "transcript-2",
				startMs: 1100,
				endMs: 2200,
				text: "Then click settings",
				speaker: "Narrator",
				confidence: 0.6,
			},
			{
				id: "transcript-3",
				startMs: 5000,
				endMs: 6200,
				text: "Notice the chart",
				speaker: "Guide",
			},
		];

		expect(buildSpeechWindows(segments)).toEqual([
			{
				id: "speech-window-1",
				startMs: 0,
				endMs: 2200,
				text: "Open the dashboard Then click settings",
				speakers: ["Narrator"],
				averageConfidence: 0.7,
				segmentIds: ["transcript-1", "transcript-2"],
			},
			{
				id: "speech-window-2",
				startMs: 5000,
				endMs: 6200,
				text: "Notice the chart",
				speakers: ["Guide"],
				averageConfidence: undefined,
				segmentIds: ["transcript-3"],
			},
		]);
	});
});
