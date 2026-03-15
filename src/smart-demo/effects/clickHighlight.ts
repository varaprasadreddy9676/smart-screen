import type { TranscriptSegment } from "@shared/ai";
import type { AnnotationRegion } from "@/components/video-editor/types";
import type { DemoSegment } from "../timelineAnalyzer";

const DIRECTIVE_PATTERNS = [
	/\bclick\b/i,
	/\bopen\b/i,
	/\blook\b/i,
	/\bsee\b/i,
	/\bnotice\b/i,
	/\bselect\b/i,
	/\bchoose\b/i,
	/\bchart\b/i,
	/\bpanel\b/i,
	/\bbutton\b/i,
	/\bmenu\b/i,
	/\bsettings\b/i,
	/\btab\b/i,
];

const CALLOUT_MATCH_WINDOW_MS = 1800;
const CALLOUT_DURATION_MS = 2200;
const CALLOUT_WIDTH_PCT = 20;
const CALLOUT_HEIGHT_PCT = 8.5;
const CALLOUT_OFFSET_PCT = 3.5;
const CALLOUT_BG = "rgba(15, 23, 42, 0.88)";
const CALLOUT_TEXT = "#ffffff";
const CALLOUT_FONT_SIZE = 24;

let _idCounter = 1;

export function resetClickHighlightIds(): void {
	_idCounter = 1;
}

function nextId(): string {
	return `smart-click-${_idCounter++}`;
}

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

function looksDirectiveLike(text: string) {
	return DIRECTIVE_PATTERNS.some((pattern) => pattern.test(text));
}

function cleanDirectiveText(text: string) {
	return text
		.replace(/^[\s,.-]*(now|then|just|okay|ok|so|and)\b[: ,.-]*/i, "")
		.replace(/\b(can you|you can|let's|lets)\b/gi, "")
		.replace(/\s+/g, " ")
		.trim();
}

function toCalloutLabel(text: string) {
	const cleaned = cleanDirectiveText(text)
		.replace(/[.?!]+$/g, "")
		.trim();
	if (!cleaned) {
		return null;
	}

	const words = cleaned.split(/\s+/).slice(0, 6);
	const label = words.join(" ");
	return label.charAt(0).toUpperCase() + label.slice(1);
}

function findNearestClickSegment(
	clickSegments: DemoSegment[],
	transcriptSegment: TranscriptSegment,
) {
	const anchorMs = Math.round((transcriptSegment.startMs + transcriptSegment.endMs) / 2);
	let best: DemoSegment | null = null;
	let bestDistance = Number.POSITIVE_INFINITY;

	for (const segment of clickSegments) {
		if (!segment.zoomTarget) {
			continue;
		}
		const clickMs = Math.round(segment.timestamp * 1000);
		const distance = Math.abs(clickMs - anchorMs);
		if (distance < bestDistance) {
			bestDistance = distance;
			best = segment;
		}
	}

	return bestDistance <= CALLOUT_MATCH_WINDOW_MS ? best : null;
}

function placeCallout(cx: number, cy: number) {
	const placeLeft = cx > 0.72;
	const placeBelow = cy < 0.2;
	const x = clamp(
		cx * 100 + (placeLeft ? -(CALLOUT_WIDTH_PCT + CALLOUT_OFFSET_PCT) : CALLOUT_OFFSET_PCT),
		2,
		98 - CALLOUT_WIDTH_PCT,
	);
	const y = clamp(
		cy * 100 + (placeBelow ? CALLOUT_OFFSET_PCT : -(CALLOUT_HEIGHT_PCT + CALLOUT_OFFSET_PCT)),
		2,
		98 - CALLOUT_HEIGHT_PCT,
	);

	return { x, y };
}

function transcriptToAnnotation(
	transcriptSegment: TranscriptSegment,
	clickSegment: DemoSegment,
): AnnotationRegion | null {
	if (!clickSegment.zoomTarget) {
		return null;
	}

	const label = toCalloutLabel(transcriptSegment.text);
	if (!label) {
		return null;
	}

	const [cx, cy] = clickSegment.zoomTarget;
	const position = placeCallout(cx, cy);
	const startMs = Math.max(
		0,
		Math.min(transcriptSegment.startMs, Math.round(clickSegment.timestamp * 1000) - 120),
	);

	return {
		id: nextId(),
		startMs,
		endMs: Math.max(startMs + 900, transcriptSegment.endMs + 1200, startMs + CALLOUT_DURATION_MS),
		type: "text",
		content: label,
		textContent: label,
		position,
		size: { width: CALLOUT_WIDTH_PCT, height: CALLOUT_HEIGHT_PCT },
		style: {
			color: CALLOUT_TEXT,
			backgroundColor: CALLOUT_BG,
			fontSize: CALLOUT_FONT_SIZE,
			fontFamily: "Inter",
			fontWeight: "bold",
			fontStyle: "normal",
			textDecoration: "none",
			textAlign: "center",
		},
		zIndex: 140,
	};
}

export function buildClickHighlights(
	segments: DemoSegment[],
	options?: { transcriptSegments?: TranscriptSegment[] },
): AnnotationRegion[] {
	resetClickHighlightIds();

	const transcriptSegments = options?.transcriptSegments ?? [];
	if (transcriptSegments.length === 0) {
		return [];
	}

	const clickSegments = segments.filter(
		(segment) => segment.action === "click" && segment.zoomTarget,
	);
	if (clickSegments.length === 0) {
		return [];
	}

	const usedClickTimestamps = new Set<number>();

	return transcriptSegments
		.filter((segment) => looksDirectiveLike(segment.text))
		.map((segment) => {
			const nearestClick = findNearestClickSegment(clickSegments, segment);
			if (!nearestClick) {
				return null;
			}

			const clickKey = Math.round(nearestClick.timestamp * 1000);
			if (usedClickTimestamps.has(clickKey)) {
				return null;
			}
			usedClickTimestamps.add(clickKey);
			return transcriptToAnnotation(segment, nearestClick);
		})
		.filter((annotation): annotation is AnnotationRegion => annotation !== null);
}
