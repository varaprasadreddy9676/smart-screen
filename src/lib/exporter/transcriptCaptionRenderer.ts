import type { TranscriptSegment } from "@shared/ai";
import type { CaptionSettings } from "@/components/video-editor/types";
import { getActiveSubtitleCue } from "@/lib/subtitles";

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
	const words = text.split(/\s+/);
	const lines: string[] = [];
	let currentLine = "";

	for (const word of words) {
		const candidate = currentLine ? `${currentLine} ${word}` : word;
		if (currentLine && ctx.measureText(candidate).width > maxWidth) {
			lines.push(currentLine);
			currentLine = word;
		} else {
			currentLine = candidate;
		}
	}

	if (currentLine) {
		lines.push(currentLine);
	}

	return lines;
}

export function renderTranscriptCaption(
	ctx: CanvasRenderingContext2D,
	transcriptSegments: TranscriptSegment[],
	timeMs: number,
	canvasWidth: number,
	canvasHeight: number,
	settings: CaptionSettings,
) {
	const activeCue = getActiveSubtitleCue(transcriptSegments, timeMs);
	if (!activeCue?.text) {
		return;
	}

	const scaleFactor = Math.max(0.65, canvasHeight / 1080);
	const fontSize = settings.fontSize * scaleFactor;
	const paddingX = 18 * scaleFactor;
	const paddingY = 10 * scaleFactor;
	const borderRadius = 14 * scaleFactor;
	const availableWidth = (canvasWidth * settings.maxWidthPercent) / 100 - paddingX * 2;
	const bottomY = canvasHeight - (canvasHeight * settings.bottomOffset) / 100;

	ctx.save();
	ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";

	const lines = wrapText(ctx, activeCue.text, availableWidth);
	const lineHeight = fontSize * 1.35;
	const textBlockHeight = lineHeight * lines.length;
	const boxWidth =
		Math.min(
			availableWidth + paddingX * 2,
			Math.max(...lines.map((line) => ctx.measureText(line).width)) + paddingX * 2,
		) || availableWidth;
	const boxHeight = textBlockHeight + paddingY * 2;
	const boxX = (canvasWidth - boxWidth) / 2;
	const boxY = bottomY - boxHeight;

	ctx.fillStyle = settings.backgroundColor;
	ctx.beginPath();
	ctx.roundRect(boxX, boxY, boxWidth, boxHeight, borderRadius);
	ctx.fill();

	ctx.fillStyle = settings.textColor;
	const textCenterY = boxY + boxHeight / 2 - (lines.length - 1) * (lineHeight / 2);
	lines.forEach((line, index) => {
		ctx.fillText(line, canvasWidth / 2, textCenterY + index * lineHeight);
	});

	ctx.restore();
}
