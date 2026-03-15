import type {
	SmartDemoAIFocusMoment,
	SmartDemoAINarrationLinkedZoomSuggestion,
	SmartDemoAISpeechAnchor,
	TranscriptSanityWarning,
	TranscriptSegment,
} from "@shared/ai";
import type { CursorTelemetryPoint } from "@/components/video-editor/types";

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
];

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

function inferTargetLabel(text: string) {
	const normalized = text.toLowerCase();
	if (normalized.includes("chart")) return "Chart";
	if (normalized.includes("panel")) return "Panel";
	if (normalized.includes("menu")) return "Menu";
	if (normalized.includes("setting")) return "Settings";
	if (normalized.includes("button")) return "Button";
	if (normalized.includes("tab")) return "Tab";
	return "UI element";
}

function looksDirectiveLike(text: string) {
	return DIRECTIVE_PATTERNS.some((pattern) => pattern.test(text));
}

function findNearestCursorPoint(
	cursorTelemetry: CursorTelemetryPoint[],
	startMs: number,
	endMs: number,
) {
	if (cursorTelemetry.length === 0) {
		return null;
	}

	const targetMs = Math.round((startMs + endMs) / 2);
	let nearestPoint: CursorTelemetryPoint | null = null;
	let nearestDistanceMs = Number.POSITIVE_INFINITY;

	for (const point of cursorTelemetry) {
		const distanceMs =
			point.timeMs >= startMs && point.timeMs <= endMs ? 0 : Math.abs(point.timeMs - targetMs);
		if (distanceMs < nearestDistanceMs) {
			nearestDistanceMs = distanceMs;
			nearestPoint = point;
		}
	}

	return nearestDistanceMs <= 1500 ? nearestPoint : null;
}

function segmentHasOutOfBoundsTimestamps(segment: TranscriptSegment, durationMs: number) {
	return segment.startMs > durationMs + 1000 || segment.endMs > durationMs + 2000;
}

export interface SpeechGroundingAnalysis {
	warnings: TranscriptSanityWarning[];
	speechAnchors: SmartDemoAISpeechAnchor[];
	narrationLinkedZooms: SmartDemoAINarrationLinkedZoomSuggestion[];
	focusMoments: SmartDemoAIFocusMoment[];
}

export function analyzeSpeechGrounding({
	transcriptSegments,
	cursorTelemetry,
	durationMs,
}: {
	transcriptSegments: TranscriptSegment[];
	cursorTelemetry: CursorTelemetryPoint[];
	durationMs: number;
}): SpeechGroundingAnalysis {
	const warnings: TranscriptSanityWarning[] = [];
	const speechAnchors: SmartDemoAISpeechAnchor[] = [];
	const narrationLinkedZooms: SmartDemoAINarrationLinkedZoomSuggestion[] = [];
	const focusMoments: SmartDemoAIFocusMoment[] = [];

	if (transcriptSegments.length === 0) {
		return {
			warnings,
			speechAnchors,
			narrationLinkedZooms,
			focusMoments,
		};
	}

	const sortedSegments = [...transcriptSegments].sort((a, b) => a.startMs - b.startMs);

	const firstSegment = sortedSegments[0];
	const lastSegment = sortedSegments[sortedSegments.length - 1];
	if (durationMs > 0) {
		const outOfBoundsCount = sortedSegments.filter((segment) =>
			segmentHasOutOfBoundsTimestamps(segment, durationMs),
		).length;
		if (outOfBoundsCount > 0) {
			warnings.push({
				id: "transcript-warning-out-of-bounds",
				severity: outOfBoundsCount > sortedSegments.length / 2 ? "error" : "warning",
				message:
					outOfBoundsCount === 1
						? "One transcript segment extends past the video duration. Review timestamps before applying AI."
						: `${outOfBoundsCount} transcript segments extend past the video duration. Review timestamps before applying AI.`,
			});
		}

		if (firstSegment.startMs > Math.max(5000, durationMs * 0.35)) {
			warnings.push({
				id: "transcript-warning-late-start",
				severity: "warning",
				message:
					"Transcript starts unusually late relative to the video. It may belong to a different recording.",
			});
		}
		if (durationMs >= 15000 && lastSegment.endMs < Math.max(5000, durationMs * 0.25)) {
			warnings.push({
				id: "transcript-warning-short-coverage",
				severity: "warning",
				message:
					"Transcript covers only a small portion of the video. Smart Screen may miss narration-driven moments.",
			});
		}
	}

	const lowConfidenceRatio =
		sortedSegments.filter(
			(segment) => typeof segment.confidence === "number" && segment.confidence < 0.4,
		).length / sortedSegments.length;
	if (lowConfidenceRatio >= 0.4) {
		warnings.push({
			id: "transcript-warning-low-confidence",
			severity: "warning",
			message:
				"Many transcript segments have low confidence. Review them before trusting narration-linked zooms.",
		});
	}

	const directiveSegments = sortedSegments.filter((segment) => looksDirectiveLike(segment.text));
	if (directiveSegments.length === 0) {
		return {
			warnings,
			speechAnchors,
			narrationLinkedZooms,
			focusMoments,
		};
	}

	let ungroundedDirectiveCount = 0;

	for (const segment of directiveSegments) {
		const targetLabel = inferTargetLabel(segment.text);
		const anchorId = `local-anchor-${speechAnchors.length + 1}`;
		const cursorPoint = findNearestCursorPoint(cursorTelemetry, segment.startMs, segment.endMs);
		const cursorGrounded = Boolean(cursorPoint);
		if (!cursorGrounded) {
			ungroundedDirectiveCount += 1;
		}

		const confidence = clamp(
			0.45 +
				(cursorGrounded ? 0.25 : 0) +
				(targetLabel !== "UI element" ? 0.15 : 0) +
				(typeof segment.confidence === "number" ? segment.confidence * 0.15 : 0),
			0,
			0.98,
		);

		speechAnchors.push({
			id: anchorId,
			startMs: segment.startMs,
			endMs: segment.endMs,
			text: segment.text,
			referencedTarget: targetLabel,
			confidence,
		});

		focusMoments.push({
			id: `local-focus-${focusMoments.length + 1}`,
			timestampMs: Math.round((segment.startMs + segment.endMs) / 2),
			title: `${targetLabel} callout`,
			reason: cursorGrounded
				? "Narration and nearby cursor movement suggest a concrete UI target."
				: "Narration contains an explicit UI callout, but local cursor grounding is weak.",
			anchorId,
			confidence,
		});

		if (cursorPoint) {
			narrationLinkedZooms.push({
				id: `local-narration-zoom-${narrationLinkedZooms.length + 1}`,
				startMs: Math.max(0, segment.startMs - 250),
				endMs: Math.max(segment.startMs + 600, segment.endMs + 500),
				focus: {
					cx: clamp(cursorPoint.cx, 0, 1),
					cy: clamp(cursorPoint.cy, 0, 1),
				},
				depth: targetLabel === "Chart" || targetLabel === "Panel" ? 2 : 3,
				reason: "Local speech grounding matched narration with nearby cursor position.",
				anchorId,
			});
		}
	}

	if (ungroundedDirectiveCount > 0) {
		warnings.push({
			id: "transcript-warning-weak-grounding",
			severity:
				ungroundedDirectiveCount > Math.max(1, directiveSegments.length / 2)
					? "warning"
					: "warning",
			message:
				ungroundedDirectiveCount === 1
					? "One narration callout could not be matched to nearby cursor motion."
					: `${ungroundedDirectiveCount} narration callouts could not be matched to nearby cursor motion.`,
		});
	}

	return {
		warnings,
		speechAnchors,
		narrationLinkedZooms,
		focusMoments,
	};
}
