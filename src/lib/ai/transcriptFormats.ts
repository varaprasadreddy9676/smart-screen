import { normalizeTranscriptSegment, type TranscriptSegment } from "@shared/ai";

const VTT_OR_SRT_TIMESTAMP =
	/(\d{2}):(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[.,](\d{3})/;
const TEXT_TIMESTAMP_LINE =
	/^\s*(?:\[)?(?:(\d{2}):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?(?:\])?\s*(?:[-:|]\s*|\s+)(.+)$/;

function toMilliseconds(hours: number, minutes: number, seconds: number, milliseconds: number) {
	return ((hours * 60 + minutes) * 60 + seconds) * 1000 + milliseconds;
}

function parseTimestampToken(raw: string) {
	const normalized = raw.trim().replace(",", ".");
	const match = normalized.match(/^(?:(\d{2}):)?(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?$/);
	if (!match) {
		return null;
	}

	const [, hoursToken, minutesToken, secondsToken, millisecondsToken] = match;
	const hours = Number(hoursToken ?? 0);
	const minutes = Number(minutesToken);
	const seconds = Number(secondsToken);
	const milliseconds = Number((millisecondsToken ?? "0").padEnd(3, "0"));
	if ([hours, minutes, seconds, milliseconds].some((value) => Number.isNaN(value))) {
		return null;
	}

	return toMilliseconds(hours, minutes, seconds, milliseconds);
}

function parseVttOrSrt(content: string) {
	const blocks = content
		.replace(/^\uFEFF/, "")
		.replace(/\r\n/g, "\n")
		.split(/\n{2,}/)
		.map((block) => block.trim())
		.filter(Boolean);

	const segments: TranscriptSegment[] = [];

	for (const block of blocks) {
		const lines = block.split("\n").map((line) => line.trim());
		const timeLine = lines.find((line) => VTT_OR_SRT_TIMESTAMP.test(line));
		if (!timeLine) {
			continue;
		}

		const match = timeLine.match(VTT_OR_SRT_TIMESTAMP);
		if (!match) {
			continue;
		}

		const startMs = toMilliseconds(
			Number(match[1]),
			Number(match[2]),
			Number(match[3]),
			Number(match[4]),
		);
		const endMs = toMilliseconds(
			Number(match[5]),
			Number(match[6]),
			Number(match[7]),
			Number(match[8]),
		);

		const textLines = lines.filter((line) => line !== timeLine && !/^\d+$/.test(line));
		const rawText = textLines.join(" ").replace(/\s+/g, " ").trim();
		if (!rawText) {
			continue;
		}

		const speakerMatch = rawText.match(/^<v\s+([^>]+)>(.*)$/i);
		const speaker = speakerMatch?.[1]?.trim();
		const text = (speakerMatch?.[2] ?? rawText).replace(/\s+/g, " ").trim();

		const segment = normalizeTranscriptSegment(
			{
				id: `transcript-${segments.length + 1}`,
				startMs,
				endMs,
				text,
				speaker,
			},
			segments.length,
		);
		if (segment) {
			segments.push(segment);
		}
	}

	return segments;
}

function parseTimestampedText(content: string) {
	const lines = content
		.replace(/^\uFEFF/, "")
		.replace(/\r\n/g, "\n")
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);

	const provisional = lines
		.map((line) => {
			const match = line.match(TEXT_TIMESTAMP_LINE);
			if (!match) {
				return null;
			}

			const [, hoursToken, minutesToken, secondsToken, millisecondsToken, text] = match;
			const startMs = toMilliseconds(
				Number(hoursToken ?? 0),
				Number(minutesToken),
				Number(secondsToken),
				Number((millisecondsToken ?? "0").padEnd(3, "0")),
			);
			return {
				startMs,
				text: text.trim(),
			};
		})
		.filter(
			(entry): entry is { startMs: number; text: string } =>
				entry !== null && entry.text.length > 0,
		);

	if (provisional.length === 0) {
		return [];
	}

	return provisional
		.map((entry, index) =>
			normalizeTranscriptSegment(
				{
					id: `transcript-${index + 1}`,
					startMs: entry.startMs,
					endMs:
						index < provisional.length - 1
							? Math.max(entry.startMs + 1, provisional[index + 1].startMs)
							: entry.startMs + 2000,
					text: entry.text,
				},
				index,
			),
		)
		.filter((segment): segment is TranscriptSegment => segment !== null);
}

function parseJsonTranscript(content: string) {
	const parsed = JSON.parse(content) as unknown;
	const rawSegments = Array.isArray(parsed)
		? parsed
		: typeof parsed === "object" &&
				parsed !== null &&
				Array.isArray((parsed as { segments?: unknown[] }).segments)
			? (parsed as { segments: unknown[] }).segments
			: [];

	return rawSegments
		.map((segment, index) => normalizeTranscriptSegment(segment, index))
		.filter((segment): segment is TranscriptSegment => segment !== null);
}

export function parseTranscriptFileContent(content: string, fileName = "transcript.txt") {
	const trimmed = content.trim();
	if (!trimmed) {
		throw new Error("Transcript file is empty.");
	}

	const lowerName = fileName.toLowerCase();
	let segments: TranscriptSegment[] = [];

	if (lowerName.endsWith(".json")) {
		segments = parseJsonTranscript(trimmed);
	} else if (lowerName.endsWith(".vtt") || trimmed.startsWith("WEBVTT")) {
		segments = parseVttOrSrt(trimmed);
	} else if (lowerName.endsWith(".srt")) {
		segments = parseVttOrSrt(trimmed);
	} else {
		try {
			segments = parseJsonTranscript(trimmed);
		} catch {
			segments = parseVttOrSrt(trimmed);
			if (segments.length === 0) {
				segments = parseTimestampedText(trimmed);
			}
		}
	}

	if (segments.length === 0) {
		throw new Error(
			"Could not parse transcript. Supported formats are JSON, VTT/SRT, or timestamped text lines.",
		);
	}

	return segments;
}

export function parseTranscriptTimestamp(raw: string) {
	return parseTimestampToken(raw);
}
