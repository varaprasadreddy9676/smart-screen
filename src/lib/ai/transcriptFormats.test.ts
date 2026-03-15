import { parseTranscriptFileContent, parseTranscriptTimestamp } from "./transcriptFormats";

describe("transcriptFormats", () => {
	it("parses JSON transcripts", () => {
		expect(
			parseTranscriptFileContent(
				JSON.stringify({
					segments: [
						{ startMs: 0, endMs: 500, text: "Open settings", confidence: 0.9 },
						{ startMs: 700, endMs: 1200, text: "Look at this chart" },
					],
				}),
				"demo.json",
			),
		).toEqual([
			{
				id: "transcript-1",
				startMs: 0,
				endMs: 500,
				text: "Open settings",
				confidence: 0.9,
			},
			{
				id: "transcript-2",
				startMs: 700,
				endMs: 1200,
				text: "Look at this chart",
			},
		]);
	});

	it("parses VTT transcripts with speakers", () => {
		const content = `WEBVTT

00:00:01.000 --> 00:00:03.000
<v Narrator>Click this button
`;

		expect(parseTranscriptFileContent(content, "demo.vtt")).toEqual([
			{
				id: "transcript-1",
				startMs: 1000,
				endMs: 3000,
				text: "Click this button",
				speaker: "Narrator",
			},
		]);
	});

	it("parses timestamped text lines", () => {
		const content = `
[00:01.250] Click this button
[00:03.000] Look at the chart
`;

		expect(parseTranscriptFileContent(content, "demo.txt")).toEqual([
			{
				id: "transcript-1",
				startMs: 1250,
				endMs: 3000,
				text: "Click this button",
			},
			{
				id: "transcript-2",
				startMs: 3000,
				endMs: 5000,
				text: "Look at the chart",
			},
		]);
	});

	it("parses standalone timestamp tokens", () => {
		expect(parseTranscriptTimestamp("01:02.500")).toBe(62500);
		expect(parseTranscriptTimestamp("00:00:03.250")).toBe(3250);
		expect(parseTranscriptTimestamp("not-a-time")).toBeNull();
	});

	it("throws for unsupported transcript input", () => {
		expect(() => parseTranscriptFileContent("hello world", "demo.txt")).toThrow(
			"Could not parse transcript",
		);
	});
});
