import type {
	CursorClickPulseSettings,
	CursorTelemetryPoint,
} from "@/components/video-editor/types";
import {
	getActiveCursorClickPulse,
	getCursorClickPulseVisual,
	projectCursorPointToStage,
} from "@/lib/cursorEnhancements";

interface RenderCursorClickPulseParams {
	ctx: CanvasRenderingContext2D;
	cursorTelemetry: CursorTelemetryPoint[];
	timeMs: number;
	canvasHeight: number;
	settings: CursorClickPulseSettings;
	layout: {
		baseScale: number;
		baseOffset: { x: number; y: number };
		stageSize: { width: number; height: number };
		sourceVideoSize: { width: number; height: number };
	};
	camera: {
		scale: number;
		focus: { cx: number; cy: number };
	};
}

export function renderCursorClickPulse({
	ctx,
	cursorTelemetry,
	timeMs,
	canvasHeight,
	settings,
	layout,
	camera,
}: RenderCursorClickPulseParams) {
	const pulse = getActiveCursorClickPulse(cursorTelemetry, timeMs, settings);
	if (!pulse) {
		return;
	}

	const point = projectCursorPointToStage({
		point: pulse,
		stageSize: layout.stageSize,
		baseScale: layout.baseScale,
		baseOffset: layout.baseOffset,
		sourceVideoSize: layout.sourceVideoSize,
		zoomScale: camera.scale,
		focus: camera.focus,
	});
	if (!point) {
		return;
	}

	const scaleFactor = Math.max(0.65, canvasHeight / 1080);
	const visual = getCursorClickPulseVisual(pulse.progress, settings.size * scaleFactor);

	ctx.save();

	ctx.globalAlpha = visual.haloOpacity;
	ctx.fillStyle = settings.color;
	ctx.beginPath();
	ctx.arc(point.x, point.y, visual.haloRadiusPx, 0, Math.PI * 2);
	ctx.fill();

	ctx.globalAlpha = visual.ringOpacity;
	ctx.strokeStyle = settings.color;
	ctx.lineWidth = Math.max(2, visual.ringRadiusPx * 0.16);
	ctx.beginPath();
	ctx.arc(point.x, point.y, visual.ringRadiusPx, 0, Math.PI * 2);
	ctx.stroke();

	ctx.globalAlpha = visual.dotOpacity;
	ctx.fillStyle = settings.color;
	ctx.beginPath();
	ctx.arc(point.x, point.y, visual.dotRadiusPx, 0, Math.PI * 2);
	ctx.fill();

	ctx.restore();
}
