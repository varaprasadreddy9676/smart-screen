interface CursorTelemetryPointLike {
	timeMs: number;
	cx: number;
	cy: number;
	kind?: "move" | "click";
	phase?: "down" | "up";
	source?: "sampled" | "native";
}

const LEGACY_CLICK_RATIO_MIN = 1.75;
const LEGACY_CLICK_RATIO_MAX = 2.25;
const MIN_LEGACY_CLICK_SAMPLES = 4;
const MAX_MOVE_MATCH_WINDOW_MS = 120;

export function repairLegacyNativeClickScale<T extends CursorTelemetryPointLike>(samples: T[]): T[] {
	const movementSamples = samples.filter((sample) => sample.kind !== "click");
	const nativeClickDowns = samples.filter(
		(sample) => sample.kind === "click" && sample.phase === "down" && sample.source === "native",
	);

	if (movementSamples.length === 0 || nativeClickDowns.length < MIN_LEGACY_CLICK_SAMPLES) {
		return samples;
	}

	const ratiosX: number[] = [];
	const ratiosY: number[] = [];

	for (const click of nativeClickDowns) {
		const nearestMove = findNearestMoveSample(movementSamples, click.timeMs);
		if (!nearestMove || Math.abs(nearestMove.timeMs - click.timeMs) > MAX_MOVE_MATCH_WINDOW_MS) {
			continue;
		}
		if (click.cx <= 0.02 || click.cy <= 0.02) {
			continue;
		}

		ratiosX.push(nearestMove.cx / click.cx);
		ratiosY.push(nearestMove.cy / click.cy);
	}

	if (ratiosX.length < MIN_LEGACY_CLICK_SAMPLES || ratiosY.length < MIN_LEGACY_CLICK_SAMPLES) {
		return samples;
	}

	const medianRatioX = median(ratiosX);
	const medianRatioY = median(ratiosY);
	if (
		medianRatioX < LEGACY_CLICK_RATIO_MIN ||
		medianRatioX > LEGACY_CLICK_RATIO_MAX ||
		medianRatioY < LEGACY_CLICK_RATIO_MIN ||
		medianRatioY > LEGACY_CLICK_RATIO_MAX
	) {
		return samples;
	}

	return samples.map((sample) => {
		if (sample.kind !== "click" || sample.source !== "native") {
			return sample;
		}

		return {
			...sample,
			cx: clamp(sample.cx * medianRatioX, 0, 1),
			cy: clamp(sample.cy * medianRatioY, 0, 1),
		};
	});
}

function findNearestMoveSample<T extends CursorTelemetryPointLike>(samples: T[], timeMs: number) {
	let best: T | null = null;
	let bestDelta = Number.POSITIVE_INFINITY;
	for (const sample of samples) {
		const delta = Math.abs(sample.timeMs - timeMs);
		if (delta < bestDelta) {
			best = sample;
			bestDelta = delta;
		}
	}
	return best;
}

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

function median(values: number[]) {
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length / 2)] ?? 1;
}
