import type { TranscriptSegment } from "@shared/ai";
import {
	formatSubtitleTimestamp,
	getActiveSubtitleCue,
	serializeTranscriptAsSrt,
	serializeTranscriptAsVtt,
} from "./subtitles";

describe("subtitles", () => {
	const segments: TranscriptSegment[] = [
		{ id: "transcript-1", startMs: 500, endMs: 1800, text: "Click this button" },
		{ id: "transcript-2", startMs: 2000, endMs: 3200, text: "Open settings" },
	];

	it("formats timestamps for srt and vtt", () => {
		expect(formatSubtitleTimestamp(3723004, "srt")).toBe("01:02:03,004");
		expect(formatSubtitleTimestamp(3723004, "vtt")).toBe("01:02:03.004");
	});

	it("serializes transcript segments as srt", () => {
		expect(serializeTranscriptAsSrt(segments)).toBe(
			"1\n00:00:00,500 --> 00:00:01,800\nClick this button\n\n2\n00:00:02,000 --> 00:00:03,200\nOpen settings",
		);
	});

	it("serializes transcript segments as vtt", () => {
		expect(serializeTranscriptAsVtt(segments)).toBe(
			"WEBVTT\n\n00:00:00.500 --> 00:00:01.800\nClick this button\n\n00:00:02.000 --> 00:00:03.200\nOpen settings",
		);
	});

	it("returns the active cue at a given time", () => {
		expect(getActiveSubtitleCue(segments, 1100)).toEqual({
			startMs: 500,
			endMs: 1800,
			text: "Click this button",
			segmentIds: ["transcript-1"],
		});
		expect(getActiveSubtitleCue(segments, 1900)).toBeNull();
	});

	it("joins overlapping segment text into one cue", () => {
		const overlapping: TranscriptSegment[] = [
			{ id: "a", startMs: 0, endMs: 1000, text: "Notice" },
			{ id: "b", startMs: 200, endMs: 1200, text: "this panel" },
		];
		expect(getActiveSubtitleCue(overlapping, 500)).toEqual({
			startMs: 0,
			endMs: 1200,
			text: "Notice this panel",
			segmentIds: ["a", "b"],
		});
	});
});
