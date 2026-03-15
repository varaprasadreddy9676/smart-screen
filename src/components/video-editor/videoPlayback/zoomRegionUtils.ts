import { ZOOM_DEPTH_SCALES, type ZoomRegion } from "../types";
import { TRANSITION_WINDOW_MS } from "./constants";
import { clamp01, smoothStep } from "./mathUtils";

const ZOOM_IN_OVERLAP_MS = 420;
const CHAINED_ZOOM_PAN_GAP_MS = 1_100;
const CONNECTED_ZOOM_PAN_DURATION_MS = 760;

type DominantRegionOptions = {
	connectZooms?: boolean;
};

type ConnectedRegionPair = {
	currentRegion: ZoomRegion;
	nextRegion: ZoomRegion;
	transitionStart: number;
	transitionEnd: number;
};

function lerp(start: number, end: number, amount: number) {
	return start + (end - start) * amount;
}

function easeConnectedPan(value: number) {
	const clamped = clamp01(value);
	return 1 - (1 - clamped) ** 3;
}

export function computeRegionStrength(region: ZoomRegion, timeMs: number) {
	const zoomInEnd = region.startMs + ZOOM_IN_OVERLAP_MS;
	const leadInStart = zoomInEnd - TRANSITION_WINDOW_MS * 1.5;
	const leadOutEnd = region.endMs + TRANSITION_WINDOW_MS;

	if (timeMs < leadInStart || timeMs > leadOutEnd) {
		return 0;
	}

	if (timeMs < zoomInEnd) {
		return smoothStep((timeMs - leadInStart) / Math.max(1, zoomInEnd - leadInStart));
	}

	if (timeMs <= region.endMs) {
		return 1;
	}

	return smoothStep((leadOutEnd - timeMs) / TRANSITION_WINDOW_MS);
}

function getConnectedRegionPairs(regions: ZoomRegion[]) {
	const sortedRegions = [...regions].sort((a, b) => a.startMs - b.startMs);
	const pairs: ConnectedRegionPair[] = [];

	for (let index = 0; index < sortedRegions.length - 1; index += 1) {
		const currentRegion = sortedRegions[index]!;
		const nextRegion = sortedRegions[index + 1]!;
		const gapMs = nextRegion.startMs - currentRegion.endMs;
		if (gapMs > CHAINED_ZOOM_PAN_GAP_MS) {
			continue;
		}

		const transitionDurationMs = Math.min(CONNECTED_ZOOM_PAN_DURATION_MS, Math.max(220, gapMs));
		pairs.push({
			currentRegion,
			nextRegion,
			transitionStart: currentRegion.endMs,
			transitionEnd: currentRegion.endMs + transitionDurationMs,
		});
	}

	return pairs;
}

function getConnectedTransition(pairs: ConnectedRegionPair[], timeMs: number) {
	for (const pair of pairs) {
		if (timeMs < pair.transitionStart || timeMs > pair.transitionEnd) {
			continue;
		}

		const progress = easeConnectedPan(
			(timeMs - pair.transitionStart) / Math.max(1, pair.transitionEnd - pair.transitionStart),
		);

		return {
			region: {
				...pair.nextRegion,
				focus: {
					cx: lerp(pair.currentRegion.focus.cx, pair.nextRegion.focus.cx, progress),
					cy: lerp(pair.currentRegion.focus.cy, pair.nextRegion.focus.cy, progress),
				},
			},
			strength: 1,
			blendedScale: lerp(
				ZOOM_DEPTH_SCALES[pair.currentRegion.depth],
				ZOOM_DEPTH_SCALES[pair.nextRegion.depth],
				progress,
			),
			sourceDepthBlend: progress,
		};
	}

	return null;
}

function getConnectedHold(pairs: ConnectedRegionPair[], timeMs: number) {
	for (const pair of pairs) {
		if (timeMs > pair.transitionEnd && timeMs < pair.nextRegion.startMs) {
			return {
				region: pair.nextRegion,
				strength: 1,
				blendedScale: ZOOM_DEPTH_SCALES[pair.nextRegion.depth],
				sourceDepthBlend: 1,
			};
		}
	}

	return null;
}

export function findDominantRegion(
	regions: ZoomRegion[],
	timeMs: number,
	options: DominantRegionOptions = {},
) {
	const connectedPairs = (options.connectZooms ?? true) ? getConnectedRegionPairs(regions) : [];
	const connectedTransition =
		connectedPairs.length > 0 ? getConnectedTransition(connectedPairs, timeMs) : null;
	if (connectedTransition) {
		return connectedTransition;
	}

	const connectedHold = connectedPairs.length > 0 ? getConnectedHold(connectedPairs, timeMs) : null;
	if (connectedHold) {
		return connectedHold;
	}

	let bestRegion: ZoomRegion | null = null;
	let bestStrength = 0;

	for (const region of regions) {
		const isSuppressedByOutgoingTransition = connectedPairs.some(
			(pair) => pair.currentRegion.id === region.id && timeMs > pair.currentRegion.endMs,
		);
		if (isSuppressedByOutgoingTransition) {
			continue;
		}

		const isSuppressedByIncomingTransition = connectedPairs.some(
			(pair) => pair.nextRegion.id === region.id && timeMs < pair.transitionEnd,
		);
		if (isSuppressedByIncomingTransition) {
			continue;
		}

		const strength = computeRegionStrength(region, timeMs);
		if (strength > bestStrength) {
			bestStrength = strength;
			bestRegion = region;
		}
	}

	return { region: bestRegion, strength: bestStrength, blendedScale: null, sourceDepthBlend: null };
}
