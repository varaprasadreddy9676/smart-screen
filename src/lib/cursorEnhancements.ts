import type {
	CursorClickPulseSettings,
	CursorTelemetryPoint,
} from "@/components/video-editor/types";

export interface ActiveCursorClickPulse {
	timeMs: number;
	cx: number;
	cy: number;
	progress: number;
	button?: CursorTelemetryPoint["button"];
	source?: CursorTelemetryPoint["source"];
}

export interface CursorClickPulseVisual {
	haloRadiusPx: number;
	ringRadiusPx: number;
	dotRadiusPx: number;
	haloOpacity: number;
	ringOpacity: number;
	dotOpacity: number;
}

export interface CursorPointProjectionInput {
	point: { cx: number; cy: number };
	stageSize: { width: number; height: number };
	baseScale: number;
	baseOffset: { x: number; y: number };
	sourceVideoSize: { width: number; height: number };
	zoomScale: number;
	focus: { cx: number; cy: number };
}

export interface CursorPointProjection {
	x: number;
	y: number;
}

export function getActiveCursorClickPulse(
	cursorTelemetry: CursorTelemetryPoint[],
	timeMs: number,
	settings: CursorClickPulseSettings,
): ActiveCursorClickPulse | null {
	if (!cursorTelemetry.length || settings.durationMs <= 0) {
		return null;
	}

	for (let i = cursorTelemetry.length - 1; i >= 0; i -= 1) {
		const sample = cursorTelemetry[i];
		if (sample.kind !== "click" || sample.phase !== "down") {
			continue;
		}

		const elapsedMs = timeMs - sample.timeMs;
		if (elapsedMs < 0) {
			continue;
		}
		if (elapsedMs > settings.durationMs) {
			break;
		}

		return {
			timeMs: sample.timeMs,
			cx: sample.cx,
			cy: sample.cy,
			progress: clamp01(elapsedMs / settings.durationMs),
			button: sample.button,
			source: sample.source,
		};
	}

	return null;
}

export function getCursorClickPulseVisual(
	progress: number,
	size = 1,
	baseRadiusPx = 18,
): CursorClickPulseVisual {
	const clampedProgress = clamp01(progress);
	const scale = Math.max(0.6, size);
	const eased = 1 - (1 - clampedProgress) * (1 - clampedProgress);

	return {
		haloRadiusPx: baseRadiusPx * scale * (0.9 + eased * 1.45),
		ringRadiusPx: baseRadiusPx * scale * (0.55 + eased * 1.1),
		dotRadiusPx: baseRadiusPx * scale * (0.18 + (1 - clampedProgress) * 0.1),
		haloOpacity: 0.18 * (1 - clampedProgress),
		ringOpacity: 0.72 * (1 - eased * 0.8),
		dotOpacity: 0.92 * (1 - clampedProgress * 0.55),
	};
}

export function projectCursorPointToStage({
	point,
	stageSize,
	baseScale,
	baseOffset,
	sourceVideoSize,
	zoomScale,
	focus,
}: CursorPointProjectionInput): CursorPointProjection | null {
	if (
		stageSize.width <= 0 ||
		stageSize.height <= 0 ||
		baseScale <= 0 ||
		sourceVideoSize.width <= 0 ||
		sourceVideoSize.height <= 0
	) {
		return null;
	}

	const sourceStageX = baseOffset.x + point.cx * sourceVideoSize.width * baseScale;
	const sourceStageY = baseOffset.y + point.cy * sourceVideoSize.height * baseScale;
	const focusStageX = focus.cx * stageSize.width;
	const focusStageY = focus.cy * stageSize.height;
	const stageCenterX = stageSize.width / 2;
	const stageCenterY = stageSize.height / 2;

	return {
		x: stageCenterX + (sourceStageX - focusStageX) * zoomScale,
		y: stageCenterY + (sourceStageY - focusStageY) * zoomScale,
	};
}

function clamp01(value: number) {
	return Math.min(1, Math.max(0, value));
}
