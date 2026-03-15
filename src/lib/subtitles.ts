import type { TranscriptSegment } from "@shared/ai";

export type SubtitleFormat = "srt" | "vtt";

export interface ActiveSubtitleCue {
	startMs: number;
	endMs: number;
	text: string;
	segmentIds: string[];
}

function pad(value: number, size = 2) {
	return String(value).padStart(size, "0");
}

function normalizeWhitespace(text: string) {
	return text.replace(/\s+/g, " ").trim();
}

function getOrderedSegments(segments: TranscriptSegment[]) {
	return [...segments]
		.filter((segment) => typeof segment.text === "string" && segment.text.trim().length > 0)
		.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
}

export function formatSubtitleTimestamp(totalMs: number, format: SubtitleFormat) {
	const clamped = Math.max(0, Math.round(totalMs));
	const hours = Math.floor(clamped / 3_600_000);
	const minutes = Math.floor((clamped % 3_600_000) / 60_000);
	const seconds = Math.floor((clamped % 60_000) / 1_000);
	const milliseconds = clamped % 1_000;
	const separator = format === "srt" ? "," : ".";
	return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}${separator}${pad(milliseconds, 3)}`;
}

export function serializeTranscriptAsSrt(segments: TranscriptSegment[]) {
	return getOrderedSegments(segments)
		.map(
			(segment, index) =>
				`${index + 1}\n${formatSubtitleTimestamp(segment.startMs, "srt")} --> ${formatSubtitleTimestamp(
					segment.endMs,
					"srt",
				)}\n${normalizeWhitespace(segment.text)}`,
		)
		.join("\n\n");
}

export function serializeTranscriptAsVtt(segments: TranscriptSegment[]) {
	const body = getOrderedSegments(segments)
		.map(
			(segment) =>
				`${formatSubtitleTimestamp(segment.startMs, "vtt")} --> ${formatSubtitleTimestamp(
					segment.endMs,
					"vtt",
				)}\n${normalizeWhitespace(segment.text)}`,
		)
		.join("\n\n");
	return body ? `WEBVTT\n\n${body}` : "WEBVTT\n";
}

export function getActiveSubtitleCue(
	segments: TranscriptSegment[],
	timeMs: number,
): ActiveSubtitleCue | null {
	const activeSegments = getOrderedSegments(segments).filter(
		(segment) => timeMs >= segment.startMs && timeMs <= segment.endMs,
	);

	if (activeSegments.length === 0) {
		return null;
	}

	return {
		startMs: Math.min(...activeSegments.map((segment) => segment.startMs)),
		endMs: Math.max(...activeSegments.map((segment) => segment.endMs)),
		text: activeSegments
			.map((segment) => normalizeWhitespace(segment.text))
			.filter(Boolean)
			.join(" ")
			.trim(),
		segmentIds: activeSegments.map((segment) => segment.id),
	};
}
