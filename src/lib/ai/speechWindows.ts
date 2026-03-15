import type { SpeechWindow, TranscriptSegment } from "@shared/ai";

interface BuildSpeechWindowsOptions {
	maxGapMs?: number;
	maxWindowDurationMs?: number;
}

function uniqueStrings(values: Array<string | undefined>) {
	return Array.from(new Set(values.filter((value): value is string => Boolean(value?.trim()))));
}

export function buildSpeechWindows(
	segments: TranscriptSegment[],
	{ maxGapMs = 1200, maxWindowDurationMs = 12000 }: BuildSpeechWindowsOptions = {},
): SpeechWindow[] {
	if (segments.length === 0) {
		return [];
	}

	const sortedSegments = [...segments].sort((a, b) => a.startMs - b.startMs);
	const windows: SpeechWindow[] = [];
	let currentSegments: TranscriptSegment[] = [];

	function flushWindow() {
		if (currentSegments.length === 0) {
			return;
		}

		const startMs = currentSegments[0].startMs;
		const endMs = currentSegments[currentSegments.length - 1].endMs;
		const confidenceValues = currentSegments
			.map((segment) => segment.confidence)
			.filter((confidence): confidence is number => typeof confidence === "number");
		windows.push({
			id: `speech-window-${windows.length + 1}`,
			startMs,
			endMs,
			text: currentSegments
				.map((segment) => segment.text)
				.join(" ")
				.replace(/\s+/g, " ")
				.trim(),
			speakers: uniqueStrings(currentSegments.map((segment) => segment.speaker)),
			averageConfidence:
				confidenceValues.length > 0
					? confidenceValues.reduce((sum, confidence) => sum + confidence, 0) /
						confidenceValues.length
					: undefined,
			segmentIds: currentSegments.map((segment) => segment.id),
		});
		currentSegments = [];
	}

	for (const segment of sortedSegments) {
		const previousSegment = currentSegments[currentSegments.length - 1];
		if (!previousSegment) {
			currentSegments.push(segment);
			continue;
		}

		const gapMs = Math.max(0, segment.startMs - previousSegment.endMs);
		const projectedDurationMs = segment.endMs - currentSegments[0].startMs;
		if (gapMs > maxGapMs || projectedDurationMs > maxWindowDurationMs) {
			flushWindow();
		}

		currentSegments.push(segment);
	}

	flushWindow();

	return windows;
}
