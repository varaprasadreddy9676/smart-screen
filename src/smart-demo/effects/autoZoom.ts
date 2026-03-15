/**
 * autoZoom.ts
 * Generates calmer ZoomRegion shot plans from demo segments.
 * Instead of zooming on every event, it clusters nearby interactions,
 * scores whether they deserve focus, and applies hysteresis so the
 * camera holds its framing instead of constantly pulsing.
 */

import type { ZoomDepth, ZoomRegion } from "@/components/video-editor/types";
import type { DemoSegment } from "../timelineAnalyzer";

// Pre-roll: start zooming this many ms before the click fires.
// Must be large enough that zoomInEnd (startMs + ZOOM_IN_OVERLAP_MS=420)
// extends past endMs, giving the hold period room to exist.
const CLICK_ZOOM_PRE_ROLL_MS = 150;
const CLICK_ZOOM_POST_ROLL_MS = 500;
const CLICK_ZOOM_MIN_DURATION_MS = 650;
const CLICK_ZOOM_MAX_DURATION_MS = 950;
const CLICK_CLUSTER_ZOOM_MAX_DURATION_MS = 1200;
const TYPING_ZOOM_TAIL_MS = 820;
const TYPING_ZOOM_PRE_ROLL_MS = 240;
const TYPING_ZOOM_MIN_DURATION_MS = 1_100;
const TYPING_ZOOM_MAX_DURATION_MS = 2_400;
// Depth 2 (1.5×) for single native clicks — visible and meaningful.
// Depth 1 (1.25×) for heuristic-only single clicks — subtle.
const NATIVE_CLICK_ZOOM_DEPTH: ZoomDepth = 2;
const HEURISTIC_CLICK_ZOOM_DEPTH: ZoomDepth = 1;
const TYPING_ZOOM_DEPTH: ZoomDepth = 2;
const CLUSTER_GAP_MS = 720;
const CLUSTER_DISTANCE_THRESHOLD = 0.11;
const SAME_SHOT_DISTANCE_THRESHOLD = 0.09;
const REFRAME_DISTANCE_THRESHOLD = 0.18;
// Lowered from 1100ms: real demos frequently have sequential clicks 700ms+ apart.
const MIN_REFRAME_GAP_MS = 700;
const EDGE_MARGIN = 0.1;
// Native clicks always pass threshold (0.88 > 0.72); heuristic clicks are 0.72.
const NATIVE_CLICK_CONFIDENCE = 0.88;
const HEURISTIC_CLICK_CONFIDENCE = 0.72;
const CLICK_CONFIDENCE_THRESHOLD = 0.72;
const OVERRIDE_REFRAME_CONFIDENCE = 0.92;

let _idCounter = 1;

function nextId(): string {
	return `smart-zoom-${_idCounter++}`;
}

/**
 * Reset the ID counter (call before each Smart Demo apply).
 */
export function resetAutoZoomIds(): void {
	_idCounter = 1;
}

interface ZoomCandidate {
	action: "click" | "typing";
	source: "native" | "heuristic";
	startMs: number;
	endMs: number;
	depth: ZoomDepth;
	focus: { cx: number; cy: number };
	confidence: number;
	segmentCount: number;
}

function distance(a: { cx: number; cy: number }, b: { cx: number; cy: number }) {
	return Math.hypot(a.cx - b.cx, a.cy - b.cy);
}

function isNearEdge(focus: { cx: number; cy: number }) {
	return (
		focus.cx <= EDGE_MARGIN ||
		focus.cx >= 1 - EDGE_MARGIN ||
		focus.cy <= EDGE_MARGIN ||
		focus.cy >= 1 - EDGE_MARGIN
	);
}

function clampDuration(
	startMs: number,
	endMs: number,
	minDurationMs: number,
	maxDurationMs: number,
) {
	return Math.min(startMs + maxDurationMs, Math.max(startMs + minDurationMs, endMs));
}

function averageFocus(segments: DemoSegment[]) {
	let totalWeight = 0;
	let weightedX = 0;
	let weightedY = 0;

	for (const segment of segments) {
		if (!segment.zoomTarget) {
			continue;
		}
		const weight = segment.action === "typing" ? 1.5 : 1;
		totalWeight += weight;
		weightedX += segment.zoomTarget[0] * weight;
		weightedY += segment.zoomTarget[1] * weight;
	}

	if (totalWeight <= 0) {
		return { cx: 0.5, cy: 0.5 };
	}

	return {
		cx: weightedX / totalWeight,
		cy: weightedY / totalWeight,
	};
}

function buildCandidate(cluster: DemoSegment[]): ZoomCandidate | null {
	const zoomableSegments = cluster.filter(
		(segment) => (segment.action === "click" || segment.action === "typing") && segment.zoomTarget,
	);
	if (zoomableSegments.length === 0) {
		return null;
	}

	const action: ZoomCandidate["action"] = zoomableSegments.some(
		(segment) => segment.action === "typing",
	)
		? "typing"
		: "click";

	// If any segment in the cluster came from a real hardware event, treat the
	// whole cluster as native — native events are more reliable focus points.
	const hasNative = zoomableSegments.some((s) => s.source === "native");
	const source: ZoomCandidate["source"] = hasNative ? "native" : "heuristic";

	const focus = averageFocus(zoomableSegments);
	const first = zoomableSegments[0]!;
	const last = zoomableSegments[zoomableSegments.length - 1]!;
	const startMs = Math.max(
		0,
		Math.round(first.timestamp * 1000) -
			(action === "typing" ? TYPING_ZOOM_PRE_ROLL_MS : CLICK_ZOOM_PRE_ROLL_MS),
	);
	const rawEndMs =
		action === "typing"
			? Math.round((last.endTimestamp ?? last.timestamp) * 1000) + TYPING_ZOOM_TAIL_MS
			: Math.round(last.timestamp * 1000) + CLICK_ZOOM_POST_ROLL_MS;
	const endMs = clampDuration(
		startMs,
		rawEndMs,
		action === "typing" ? TYPING_ZOOM_MIN_DURATION_MS : CLICK_ZOOM_MIN_DURATION_MS,
		action === "typing"
			? TYPING_ZOOM_MAX_DURATION_MS
			: zoomableSegments.length > 1
				? CLICK_CLUSTER_ZOOM_MAX_DURATION_MS
				: CLICK_ZOOM_MAX_DURATION_MS,
	);

	// Native clicks get higher base confidence, ensuring single native clicks
	// always clear CLICK_CONFIDENCE_THRESHOLD.
	let confidence =
		action === "typing" ? 1 : source === "native" ? NATIVE_CLICK_CONFIDENCE : HEURISTIC_CLICK_CONFIDENCE;
	if (zoomableSegments.length > 1) {
		confidence += 0.14;
	}
	if (isNearEdge(focus)) {
		confidence -= 0.16;
	}

	// Depth: use a more visible zoom for native clicks; clusters always get depth 2+.
	let depth: ZoomDepth;
	if (action === "typing") {
		depth = TYPING_ZOOM_DEPTH;
	} else if (zoomableSegments.length > 1) {
		depth = 2;
	} else {
		depth = source === "native" ? NATIVE_CLICK_ZOOM_DEPTH : HEURISTIC_CLICK_ZOOM_DEPTH;
	}

	return {
		action,
		source,
		startMs,
		endMs,
		depth,
		focus,
		confidence: Math.max(0, Math.min(1, confidence)),
		segmentCount: zoomableSegments.length,
	};
}

function shouldCluster(left: DemoSegment, right: DemoSegment) {
	if (!left.zoomTarget || !right.zoomTarget) {
		return false;
	}

	const gapMs = Math.max(0, Math.round((right.timestamp - left.timestamp) * 1000));
	if (gapMs > CLUSTER_GAP_MS) {
		return false;
	}

	return (
		distance(
			{ cx: left.zoomTarget[0], cy: left.zoomTarget[1] },
			{ cx: right.zoomTarget[0], cy: right.zoomTarget[1] },
		) <= CLUSTER_DISTANCE_THRESHOLD
	);
}

function buildCandidates(segments: DemoSegment[]) {
	const zoomableSegments = segments.filter(
		(segment) => (segment.action === "click" || segment.action === "typing") && segment.zoomTarget,
	);
	const clusters: DemoSegment[][] = [];

	for (const segment of zoomableSegments) {
		const currentCluster = clusters[clusters.length - 1];
		const previous = currentCluster?.[currentCluster.length - 1];
		if (currentCluster && previous && shouldCluster(previous, segment)) {
			currentCluster.push(segment);
		} else {
			clusters.push([segment]);
		}
	}

	return clusters
		.map(buildCandidate)
		.filter((candidate): candidate is ZoomCandidate => candidate !== null)
		.filter(
			(candidate) =>
				candidate.action === "typing" || candidate.confidence >= CLICK_CONFIDENCE_THRESHOLD,
		);
}

/**
 * Build calmer shot plans from all zoomable segments.
 */
export function buildAutoZoomRegions(segments: DemoSegment[]): ZoomRegion[] {
	resetAutoZoomIds();

	const candidates = buildCandidates(segments);
	const planned: ZoomCandidate[] = [];

	for (const candidate of candidates) {
		const last = planned[planned.length - 1];
		if (!last) {
			planned.push(candidate);
			continue;
		}

		const focusDistance = distance(last.focus, candidate.focus);
		const gapMs = candidate.startMs - last.endMs;

		// Same-shot merge: close in both space and time → extend current shot.
		if (focusDistance <= SAME_SHOT_DISTANCE_THRESHOLD && gapMs <= CLUSTER_GAP_MS) {
			last.endMs = clampDuration(
				last.startMs,
				Math.max(last.endMs, candidate.endMs),
				last.action === "typing" ? TYPING_ZOOM_MIN_DURATION_MS : CLICK_ZOOM_MIN_DURATION_MS,
				last.action === "typing" ? TYPING_ZOOM_MAX_DURATION_MS : CLICK_CLUSTER_ZOOM_MAX_DURATION_MS,
			);
			last.depth = Math.max(last.depth, candidate.depth) as ZoomDepth;
			last.confidence = Math.max(last.confidence, candidate.confidence);
			last.focus = {
				cx: (last.focus.cx + candidate.focus.cx) / 2,
				cy: (last.focus.cy + candidate.focus.cy) / 2,
			};
			// Upgrade source: if either shot had a native event, the merged shot is native.
			if (candidate.source === "native") {
				last.source = "native";
			}
			continue;
		}

		// A candidate can override the gap suppression if it's a large reframe
		// triggered by a reliable event (high-confidence typing or a native click).
		const requiresOverride =
			focusDistance >= REFRAME_DISTANCE_THRESHOLD &&
			(
				(candidate.confidence >= OVERRIDE_REFRAME_CONFIDENCE && candidate.action === "typing") ||
				candidate.source === "native"
			);

		// Too soon and not important enough — skip to avoid camera breathing.
		if (gapMs < MIN_REFRAME_GAP_MS && !requiresOverride) {
			continue;
		}

		// Small reframe (focus barely moved) with low confidence — skip.
		if (
			focusDistance < REFRAME_DISTANCE_THRESHOLD &&
			candidate.confidence < OVERRIDE_REFRAME_CONFIDENCE
		) {
			continue;
		}

		planned.push(candidate);
	}

	return planned.map((candidate) => ({
		id: nextId(),
		startMs: candidate.startMs,
		endMs: candidate.endMs,
		depth: candidate.depth,
		focus: candidate.focus,
	}));
}
