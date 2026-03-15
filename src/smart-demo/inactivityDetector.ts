/**
 * inactivityDetector.ts
 * Detects periods of cursor inactivity in cursor telemetry.
 * Periods longer than SILENCE_THRESHOLD_S are marked as silence segments.
 */

import {
	type CursorTelemetryPoint,
	isMovementTelemetryPoint,
} from "@/components/video-editor/types";

export interface SilenceSegment {
	startMs: number;
	endMs: number;
	durationMs: number;
}

const SILENCE_THRESHOLD_S = 3; // seconds of no movement = silence
const SILENCE_THRESHOLD_MS = SILENCE_THRESHOLD_S * 1000;
const MOVEMENT_THRESHOLD = 0.008; // normalized units – below this = "still"

function cursorDelta(a: CursorTelemetryPoint, b: CursorTelemetryPoint): number {
	return Math.sqrt((a.cx - b.cx) ** 2 + (a.cy - b.cy) ** 2);
}

/**
 * Given cursor telemetry, returns silence segments (periods of no movement).
 */
export function detectSilence(telemetry: CursorTelemetryPoint[]): SilenceSegment[] {
	const movementSamples = telemetry.filter(isMovementTelemetryPoint);
	if (movementSamples.length < 2) return [];

	const segments: SilenceSegment[] = [];
	let silenceStart: number | null = null;

	for (let i = 1; i < movementSamples.length; i++) {
		const delta = cursorDelta(movementSamples[i - 1], movementSamples[i]);
		const isStill = delta < MOVEMENT_THRESHOLD;

		if (isStill && silenceStart === null) {
			silenceStart = movementSamples[i - 1].timeMs;
		} else if (!isStill && silenceStart !== null) {
			const durationMs = movementSamples[i].timeMs - silenceStart;
			if (durationMs >= SILENCE_THRESHOLD_MS) {
				segments.push({
					startMs: silenceStart,
					endMs: movementSamples[i].timeMs,
					durationMs,
				});
			}
			silenceStart = null;
		}
	}

	// Handle trailing silence
	if (silenceStart !== null) {
		const last = movementSamples[movementSamples.length - 1];
		const durationMs = last.timeMs - silenceStart;
		if (durationMs >= SILENCE_THRESHOLD_MS) {
			segments.push({
				startMs: silenceStart,
				endMs: last.timeMs,
				durationMs,
			});
		}
	}

	return segments;
}

/**
 * Returns trim candidates: silence segments that could be cut from the demo.
 * Only suggests cutting silences in the middle of the recording (not at the start).
 */
export function getSuggestedTrimRegions(
	silences: SilenceSegment[],
	totalDurationMs: number,
): SilenceSegment[] {
	return silences.filter((s) => {
		// Skip the very beginning or very end (user may be setting up)
		const isAtStart = s.startMs < 1000;
		const isAtEnd = s.endMs > totalDurationMs - 1000;
		return !isAtStart && !isAtEnd;
	});
}
