/**
 * interactionRecorder.ts
 * Captures and processes interaction events during screen recording.
 * Uses cursor telemetry from the main process and derives interaction types
 * through velocity + position analysis.
 */

import {
	type CursorTelemetryPoint,
	isClickTelemetryPoint,
	isMovementTelemetryPoint,
} from "@/components/video-editor/types";

export type InteractionType = "click" | "typing" | "window-change" | "navigation";

export interface InteractionEvent {
	type: InteractionType;
	x: number; // normalized 0-1
	y: number; // normalized 0-1
	timestamp: number; // seconds
	duration?: number; // seconds (for typing bursts)
	app?: string; // for window-change
	source?: "native" | "heuristic";
}

// Heuristic thresholds tuned for 10Hz cursor telemetry captured during recording.
const STILL_MOVE_THRESHOLD = 0.01;
const CLICK_CONTEXT_MOVE_THRESHOLD = 0.015;
const CLICK_DWELL_MIN_MS = 80;
const CLICK_DWELL_MAX_MS = 1200;
const CLICK_RUN_RADIUS_THRESHOLD = 0.025;
const TYPING_MIN_DURATION_MS = 1400;
const WINDOW_CHANGE_DISTANCE_THRESHOLD = 0.6;
const EXPLICIT_CLICK_DEDUP_WINDOW_S = 0.35;
const EXPLICIT_CLICK_DEDUP_DISTANCE_THRESHOLD = 0.05;
const CLICK_CONTEXT_WINDOW_SAMPLES = 2;

function distance(a: CursorTelemetryPoint, b: CursorTelemetryPoint): number {
	return Math.sqrt((a.cx - b.cx) ** 2 + (a.cy - b.cy) ** 2);
}

function averageFocus(samples: CursorTelemetryPoint[]) {
	return {
		x: samples.reduce((sum, sample) => sum + sample.cx, 0) / samples.length,
		y: samples.reduce((sum, sample) => sum + sample.cy, 0) / samples.length,
	};
}

function maxRunRadius(samples: CursorTelemetryPoint[]) {
	let maxRadius = 0;
	for (let index = 1; index < samples.length; index += 1) {
		maxRadius = Math.max(maxRadius, distance(samples[index - 1]!, samples[index]!));
	}
	return maxRadius;
}

function distanceToFocus(x: number, y: number, click: InteractionEvent) {
	return Math.hypot(click.x - x, click.y - y);
}

function contextMovementMagnitude(
	telemetry: CursorTelemetryPoint[],
	runStart: number,
	runEnd: number,
): { before: number; after: number } {
	const start = telemetry[runStart];
	const end = telemetry[runEnd];
	if (!start || !end) {
		return { before: 0, after: 0 };
	}

	const beforeIndex = Math.max(0, runStart - CLICK_CONTEXT_WINDOW_SAMPLES);
	const afterIndex = Math.min(telemetry.length - 1, runEnd + CLICK_CONTEXT_WINDOW_SAMPLES);
	let before = 0;
	for (let index = beforeIndex; index < runStart; index += 1) {
		before = Math.max(before, distance(telemetry[index]!, start));
	}
	let after = 0;
	for (let index = runEnd + 1; index <= afterIndex; index += 1) {
		after = Math.max(after, distance(end, telemetry[index]!));
	}
	return { before, after };
}

/**
 * Analyse raw cursor telemetry and return a list of inferred interaction events.
 */
export function analyzeInteractions(telemetry: CursorTelemetryPoint[]): InteractionEvent[] {
	if (telemetry.length < 2) return [];

	const movementSamples = telemetry.filter(isMovementTelemetryPoint);
	const explicitClickEvents = telemetry
		.filter(
			(sample) =>
				isClickTelemetryPoint(sample) &&
				sample.phase === "down" &&
				(sample.button === "left" || sample.button === "right" || sample.button === "middle"),
		)
		.map<InteractionEvent>((sample) => ({
			type: "click",
			x: sample.cx,
			y: sample.cy,
			timestamp: sample.timeMs / 1000,
			source: "native",
		}));

	if (movementSamples.length < 2) {
		return explicitClickEvents;
	}

	const events: InteractionEvent[] = [...explicitClickEvents];

	for (let index = 1; index < movementSamples.length; index += 1) {
		const prev = movementSamples[index - 1]!;
		const curr = movementSamples[index]!;
		if (distance(prev, curr) > WINDOW_CHANGE_DISTANCE_THRESHOLD) {
			events.push({
				type: "window-change",
				x: curr.cx,
				y: curr.cy,
				timestamp: curr.timeMs / 1000,
			});
		}
	}

	let runStart = 0;
	for (let index = 1; index <= movementSamples.length; index += 1) {
		const prev = movementSamples[index - 1] ?? null;
		const curr = movementSamples[index] ?? null;
		const stillContinuing =
			prev !== null && curr !== null && distance(prev, curr) <= STILL_MOVE_THRESHOLD;

		if (stillContinuing) {
			continue;
		}

		const runEnd = index - 1;
		const runSamples = movementSamples.slice(runStart, runEnd + 1);
		if (runSamples.length >= 2) {
			const start = runSamples[0]!;
			const end = runSamples[runSamples.length - 1]!;
			const dwellMs = end.timeMs - start.timeMs;
			const { x, y } = averageFocus(runSamples);
			const runRadius = maxRunRadius(runSamples);
			const contextMovement = contextMovementMagnitude(movementSamples, runStart, runEnd);
			const hasClickContext =
				(contextMovement.before >= CLICK_CONTEXT_MOVE_THRESHOLD &&
					contextMovement.before < WINDOW_CHANGE_DISTANCE_THRESHOLD) ||
				(contextMovement.after >= CLICK_CONTEXT_MOVE_THRESHOLD &&
					contextMovement.after < WINDOW_CHANGE_DISTANCE_THRESHOLD);

			const collidesWithExplicitClick = explicitClickEvents.some(
				(click) =>
					Math.abs(click.timestamp - start.timeMs / 1000) <= EXPLICIT_CLICK_DEDUP_WINDOW_S &&
					distanceToFocus(x, y, click) <= EXPLICIT_CLICK_DEDUP_DISTANCE_THRESHOLD,
			);

			if (dwellMs >= TYPING_MIN_DURATION_MS) {
				const lastEvent = events[events.length - 1];
				if (
					!lastEvent ||
					lastEvent.type !== "typing" ||
					Math.abs(lastEvent.timestamp - start.timeMs / 1000) > 2
				) {
					events.push({
						type: "typing",
						x,
						y,
						timestamp: start.timeMs / 1000,
						duration: dwellMs / 1000,
					});
				}
			} else if (
				dwellMs >= CLICK_DWELL_MIN_MS &&
				dwellMs <= CLICK_DWELL_MAX_MS &&
				runRadius <= CLICK_RUN_RADIUS_THRESHOLD &&
				hasClickContext &&
				!collidesWithExplicitClick
			) {
				events.push({
					type: "click",
					x,
					y,
					timestamp: start.timeMs / 1000,
					source: "heuristic",
				});
			}
		}

		runStart = index;
	}

	for (let index = 1; index < movementSamples.length - 1; index += 1) {
		const prev = movementSamples[index - 1]!;
		const curr = movementSamples[index]!;
		const next = movementSamples[index + 1]!;

		const segment = movementSamples.slice(Math.max(0, index - 2), index + 3);
		const totalDist = segment.reduce((sum, point, segmentIndex) => {
			if (segmentIndex === 0) return sum;
			return sum + distance(segment[segmentIndex - 1]!, point);
		}, 0);
		const dt = Math.max(1, next.timeMs - prev.timeMs) / 1000;
		const sweepVelocity = totalDist / dt;
		if (totalDist > 0.3 && sweepVelocity > 0.05) {
			const timestamp = curr.timeMs / 1000;
			const collidesWithFocusedAction = events.some(
				(event) =>
					(event.type === "click" || event.type === "typing" || event.type === "window-change") &&
					Math.abs(event.timestamp - timestamp) < 0.4,
			);
			if (collidesWithFocusedAction) {
				continue;
			}
			const lastEvent = events[events.length - 1];
			if (
				!lastEvent ||
				lastEvent.type !== "navigation" ||
				Math.abs(lastEvent.timestamp - timestamp) > 1
			) {
				events.push({
					type: "navigation",
					x: curr.cx,
					y: curr.cy,
					timestamp,
				});
			}
		}
	}

	// De-duplicate events that are very close in time (< 300ms apart, same type)
	return events
		.sort((a, b) => a.timestamp - b.timestamp)
		.filter((event, idx, sortedEvents) => {
			if (idx === 0) return true;
			const prior = sortedEvents[idx - 1]!;
			return !(event.type === prior.type && Math.abs(event.timestamp - prior.timestamp) < 0.3);
		});
}
