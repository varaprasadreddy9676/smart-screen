import type {
	KeystrokeOverlaySettings,
	KeystrokeTelemetryEvent,
} from "@/components/video-editor/types";
import { getActiveKeystrokeCue } from "@/lib/keystrokes";

export function renderKeystrokeOverlay(
	ctx: CanvasRenderingContext2D,
	events: KeystrokeTelemetryEvent[],
	timeMs: number,
	canvasWidth: number,
	canvasHeight: number,
	settings: KeystrokeOverlaySettings,
) {
	const cue = getActiveKeystrokeCue(events, timeMs, settings);
	if (!cue?.text) {
		return;
	}

	const scaleFactor = Math.max(0.65, canvasHeight / 1080);
	const fontSize = settings.fontSize * scaleFactor;
	const paddingX = 18 * scaleFactor;
	const paddingY = 10 * scaleFactor;
	const borderRadius = 16 * scaleFactor;
	const bottomY = canvasHeight - (canvasHeight * settings.bottomOffset) / 100;

	ctx.save();
	ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";

	const textWidth = ctx.measureText(cue.text).width;
	const boxWidth = textWidth + paddingX * 2;
	const boxHeight = fontSize * 1.3 + paddingY * 2;
	const boxX = (canvasWidth - boxWidth) / 2;
	const boxY = bottomY - boxHeight;

	ctx.fillStyle = settings.backgroundColor;
	ctx.beginPath();
	ctx.roundRect(boxX, boxY, boxWidth, boxHeight, borderRadius);
	ctx.fill();

	ctx.fillStyle = settings.textColor;
	ctx.fillText(cue.text, canvasWidth / 2, boxY + boxHeight / 2);
	ctx.restore();
}
