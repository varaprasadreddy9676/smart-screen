import { normalizeTranscriptSegment, type TranscriptSegment } from "@shared/ai";
import type { ExportFormat, ExportQuality, GifFrameRate, GifSizePreset } from "@/lib/exporter";
import { ASPECT_RATIOS, type AspectRatio } from "@/utils/aspectRatioUtils";
import {
	type AnnotationRegion,
	type CaptionSettings,
	type CropRegion,
	type CursorClickPulseSettings,
	DEFAULT_ANNOTATION_POSITION,
	DEFAULT_ANNOTATION_SIZE,
	DEFAULT_ANNOTATION_STYLE,
	DEFAULT_CAPTION_SETTINGS,
	DEFAULT_CROP_REGION,
	DEFAULT_CURSOR_CLICK_PULSE_SETTINGS,
	DEFAULT_FIGURE_DATA,
	DEFAULT_KEYSTROKE_OVERLAY_SETTINGS,
	DEFAULT_PLAYBACK_SPEED,
	DEFAULT_ZOOM_DEPTH,
	DEFAULT_ZOOM_MOTION_BLUR,
	type KeystrokeOverlaySettings,
	type SpeedRegion,
	type TrimRegion,
	type ZoomRegion,
} from "./types";

const WALLPAPER_COUNT = 18;

export const WALLPAPER_PATHS = Array.from(
	{ length: WALLPAPER_COUNT },
	(_, i) => `/wallpapers/wallpaper${i + 1}.jpg`,
);

export const PROJECT_VERSION = 1;

export interface ProjectEditorState {
	wallpaper: string;
	shadowIntensity: number;
	showBlur: boolean;
	motionBlurEnabled: boolean;
	connectZooms: boolean;
	zoomMotionBlur: number;
	borderRadius: number;
	padding: number;
	cropRegion: CropRegion;
	zoomRegions: ZoomRegion[];
	trimRegions: TrimRegion[];
	speedRegions: SpeedRegion[];
	annotationRegions: AnnotationRegion[];
	aspectRatio: AspectRatio;
	exportQuality: ExportQuality;
	exportFormat: ExportFormat;
	gifFrameRate: GifFrameRate;
	gifLoop: boolean;
	gifSizePreset: GifSizePreset;
	transcriptSegments: TranscriptSegment[];
	captionSettings: CaptionSettings;
	cursorClickPulseSettings: CursorClickPulseSettings;
	keystrokeOverlaySettings: KeystrokeOverlaySettings;
}

export interface EditorProjectData {
	version: number;
	videoPath: string;
	editor: ProjectEditorState;
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

export function toFileUrl(filePath: string): string {
	const normalized = filePath.replace(/\\/g, "/");
	if (normalized.match(/^[a-zA-Z]:/)) {
		return `file:///${normalized}`;
	}
	return `file://${normalized}`;
}

export function fromFileUrl(fileUrl: string): string {
	if (!fileUrl.startsWith("file://")) {
		return fileUrl;
	}

	try {
		const url = new URL(fileUrl);
		return decodeURIComponent(url.pathname);
	} catch {
		return fileUrl.replace(/^file:\/\//, "");
	}
}

export function deriveNextId(prefix: string, ids: string[]): number {
	const max = ids.reduce((acc, id) => {
		const match = id.match(new RegExp(`^${prefix}-(\\d+)$`));
		if (!match) return acc;
		const value = Number(match[1]);
		return Number.isFinite(value) ? Math.max(acc, value) : acc;
	}, 0);
	return max + 1;
}

export function validateProjectData(candidate: unknown): candidate is EditorProjectData {
	if (!candidate || typeof candidate !== "object") return false;
	const project = candidate as Partial<EditorProjectData>;
	if (typeof project.version !== "number") return false;
	if (typeof project.videoPath !== "string" || !project.videoPath) return false;
	if (!project.editor || typeof project.editor !== "object") return false;
	return true;
}

export function normalizeProjectEditor(editor: Partial<ProjectEditorState>): ProjectEditorState {
	const validAspectRatios = new Set<AspectRatio>(ASPECT_RATIOS);

	const normalizedZoomRegions: ZoomRegion[] = Array.isArray(editor.zoomRegions)
		? editor.zoomRegions
				.filter((region): region is ZoomRegion => Boolean(region && typeof region.id === "string"))
				.map((region) => {
					const rawStart = isFiniteNumber(region.startMs) ? Math.round(region.startMs) : 0;
					const rawEnd = isFiniteNumber(region.endMs) ? Math.round(region.endMs) : rawStart + 1000;
					const startMs = Math.max(0, Math.min(rawStart, rawEnd));
					const endMs = Math.max(startMs + 1, rawEnd);

					return {
						id: region.id,
						startMs,
						endMs,
						depth: [1, 2, 3, 4, 5, 6].includes(region.depth) ? region.depth : DEFAULT_ZOOM_DEPTH,
						focus: {
							cx: clamp(isFiniteNumber(region.focus?.cx) ? region.focus.cx : 0.5, 0, 1),
							cy: clamp(isFiniteNumber(region.focus?.cy) ? region.focus.cy : 0.5, 0, 1),
						},
					};
				})
		: [];

	const normalizedTrimRegions: TrimRegion[] = Array.isArray(editor.trimRegions)
		? editor.trimRegions
				.filter((region): region is TrimRegion => Boolean(region && typeof region.id === "string"))
				.map((region) => {
					const rawStart = isFiniteNumber(region.startMs) ? Math.round(region.startMs) : 0;
					const rawEnd = isFiniteNumber(region.endMs) ? Math.round(region.endMs) : rawStart + 1000;
					const startMs = Math.max(0, Math.min(rawStart, rawEnd));
					const endMs = Math.max(startMs + 1, rawEnd);
					return {
						id: region.id,
						startMs,
						endMs,
					};
				})
		: [];

	const normalizedSpeedRegions: SpeedRegion[] = Array.isArray(editor.speedRegions)
		? editor.speedRegions
				.filter((region): region is SpeedRegion => Boolean(region && typeof region.id === "string"))
				.map((region) => {
					const rawStart = isFiniteNumber(region.startMs) ? Math.round(region.startMs) : 0;
					const rawEnd = isFiniteNumber(region.endMs) ? Math.round(region.endMs) : rawStart + 1000;
					const startMs = Math.max(0, Math.min(rawStart, rawEnd));
					const endMs = Math.max(startMs + 1, rawEnd);

					const speed =
						region.speed === 0.25 ||
						region.speed === 0.5 ||
						region.speed === 0.75 ||
						region.speed === 1.25 ||
						region.speed === 1.5 ||
						region.speed === 1.75 ||
						region.speed === 2
							? region.speed
							: DEFAULT_PLAYBACK_SPEED;

					return {
						id: region.id,
						startMs,
						endMs,
						speed,
					};
				})
		: [];

	const normalizedAnnotationRegions: AnnotationRegion[] = Array.isArray(editor.annotationRegions)
		? editor.annotationRegions
				.filter((region): region is AnnotationRegion =>
					Boolean(region && typeof region.id === "string"),
				)
				.map((region, index) => {
					const rawStart = isFiniteNumber(region.startMs) ? Math.round(region.startMs) : 0;
					const rawEnd = isFiniteNumber(region.endMs) ? Math.round(region.endMs) : rawStart + 1000;
					const startMs = Math.max(0, Math.min(rawStart, rawEnd));
					const endMs = Math.max(startMs + 1, rawEnd);

					return {
						id: region.id,
						startMs,
						endMs,
						type: region.type === "image" || region.type === "figure" ? region.type : "text",
						content: typeof region.content === "string" ? region.content : "",
						textContent: typeof region.textContent === "string" ? region.textContent : undefined,
						imageContent: typeof region.imageContent === "string" ? region.imageContent : undefined,
						position: {
							x: clamp(
								isFiniteNumber(region.position?.x)
									? region.position.x
									: DEFAULT_ANNOTATION_POSITION.x,
								0,
								100,
							),
							y: clamp(
								isFiniteNumber(region.position?.y)
									? region.position.y
									: DEFAULT_ANNOTATION_POSITION.y,
								0,
								100,
							),
						},
						size: {
							width: clamp(
								isFiniteNumber(region.size?.width)
									? region.size.width
									: DEFAULT_ANNOTATION_SIZE.width,
								1,
								200,
							),
							height: clamp(
								isFiniteNumber(region.size?.height)
									? region.size.height
									: DEFAULT_ANNOTATION_SIZE.height,
								1,
								200,
							),
						},
						style: {
							...DEFAULT_ANNOTATION_STYLE,
							...(region.style && typeof region.style === "object" ? region.style : {}),
						},
						zIndex: isFiniteNumber(region.zIndex) ? region.zIndex : index + 1,
						figureData: region.figureData
							? {
									...DEFAULT_FIGURE_DATA,
									...region.figureData,
								}
							: undefined,
					};
				})
		: [];

	const normalizedTranscriptSegments: TranscriptSegment[] = Array.isArray(editor.transcriptSegments)
		? editor.transcriptSegments
				.map((segment, index) => normalizeTranscriptSegment(segment, index))
				.filter((segment): segment is TranscriptSegment => segment !== null)
		: [];

	const normalizedCaptionSettings: CaptionSettings = {
		showInPreview:
			typeof editor.captionSettings?.showInPreview === "boolean"
				? editor.captionSettings.showInPreview
				: DEFAULT_CAPTION_SETTINGS.showInPreview,
		burnInDuringExport:
			typeof editor.captionSettings?.burnInDuringExport === "boolean"
				? editor.captionSettings.burnInDuringExport
				: DEFAULT_CAPTION_SETTINGS.burnInDuringExport,
		fontSize: isFiniteNumber(editor.captionSettings?.fontSize)
			? clamp(editor.captionSettings.fontSize, 12, 72)
			: DEFAULT_CAPTION_SETTINGS.fontSize,
		bottomOffset: isFiniteNumber(editor.captionSettings?.bottomOffset)
			? clamp(editor.captionSettings.bottomOffset, 2, 20)
			: DEFAULT_CAPTION_SETTINGS.bottomOffset,
		maxWidthPercent: isFiniteNumber(editor.captionSettings?.maxWidthPercent)
			? clamp(editor.captionSettings.maxWidthPercent, 40, 95)
			: DEFAULT_CAPTION_SETTINGS.maxWidthPercent,
		textColor:
			typeof editor.captionSettings?.textColor === "string" &&
			editor.captionSettings.textColor.trim().length > 0
				? editor.captionSettings.textColor
				: DEFAULT_CAPTION_SETTINGS.textColor,
		backgroundColor:
			typeof editor.captionSettings?.backgroundColor === "string" &&
			editor.captionSettings.backgroundColor.trim().length > 0
				? editor.captionSettings.backgroundColor
				: DEFAULT_CAPTION_SETTINGS.backgroundColor,
	};

	const normalizedCursorClickPulseSettings: CursorClickPulseSettings = {
		showInPreview:
			typeof editor.cursorClickPulseSettings?.showInPreview === "boolean"
				? editor.cursorClickPulseSettings.showInPreview
				: DEFAULT_CURSOR_CLICK_PULSE_SETTINGS.showInPreview,
		burnInDuringExport:
			typeof editor.cursorClickPulseSettings?.burnInDuringExport === "boolean"
				? editor.cursorClickPulseSettings.burnInDuringExport
				: DEFAULT_CURSOR_CLICK_PULSE_SETTINGS.burnInDuringExport,
		durationMs: isFiniteNumber(editor.cursorClickPulseSettings?.durationMs)
			? clamp(editor.cursorClickPulseSettings.durationMs, 220, 900)
			: DEFAULT_CURSOR_CLICK_PULSE_SETTINGS.durationMs,
		size: isFiniteNumber(editor.cursorClickPulseSettings?.size)
			? clamp(editor.cursorClickPulseSettings.size, 0.75, 1.75)
			: DEFAULT_CURSOR_CLICK_PULSE_SETTINGS.size,
		color:
			typeof editor.cursorClickPulseSettings?.color === "string" &&
			editor.cursorClickPulseSettings.color.trim().length > 0
				? editor.cursorClickPulseSettings.color
				: DEFAULT_CURSOR_CLICK_PULSE_SETTINGS.color,
	};

	const normalizedKeystrokeOverlaySettings: KeystrokeOverlaySettings = {
		showInPreview:
			typeof editor.keystrokeOverlaySettings?.showInPreview === "boolean"
				? editor.keystrokeOverlaySettings.showInPreview
				: DEFAULT_KEYSTROKE_OVERLAY_SETTINGS.showInPreview,
		burnInDuringExport:
			typeof editor.keystrokeOverlaySettings?.burnInDuringExport === "boolean"
				? editor.keystrokeOverlaySettings.burnInDuringExport
				: DEFAULT_KEYSTROKE_OVERLAY_SETTINGS.burnInDuringExport,
		durationMs: isFiniteNumber(editor.keystrokeOverlaySettings?.durationMs)
			? clamp(editor.keystrokeOverlaySettings.durationMs, 300, 3000)
			: DEFAULT_KEYSTROKE_OVERLAY_SETTINGS.durationMs,
		fontSize: isFiniteNumber(editor.keystrokeOverlaySettings?.fontSize)
			? clamp(editor.keystrokeOverlaySettings.fontSize, 14, 48)
			: DEFAULT_KEYSTROKE_OVERLAY_SETTINGS.fontSize,
		bottomOffset: isFiniteNumber(editor.keystrokeOverlaySettings?.bottomOffset)
			? clamp(editor.keystrokeOverlaySettings.bottomOffset, 6, 40)
			: DEFAULT_KEYSTROKE_OVERLAY_SETTINGS.bottomOffset,
		textColor:
			typeof editor.keystrokeOverlaySettings?.textColor === "string" &&
			editor.keystrokeOverlaySettings.textColor.trim().length > 0
				? editor.keystrokeOverlaySettings.textColor
				: DEFAULT_KEYSTROKE_OVERLAY_SETTINGS.textColor,
		backgroundColor:
			typeof editor.keystrokeOverlaySettings?.backgroundColor === "string" &&
			editor.keystrokeOverlaySettings.backgroundColor.trim().length > 0
				? editor.keystrokeOverlaySettings.backgroundColor
				: DEFAULT_KEYSTROKE_OVERLAY_SETTINGS.backgroundColor,
	};

	const rawCropX = isFiniteNumber(editor.cropRegion?.x)
		? editor.cropRegion.x
		: DEFAULT_CROP_REGION.x;
	const rawCropY = isFiniteNumber(editor.cropRegion?.y)
		? editor.cropRegion.y
		: DEFAULT_CROP_REGION.y;
	const rawCropWidth = isFiniteNumber(editor.cropRegion?.width)
		? editor.cropRegion.width
		: DEFAULT_CROP_REGION.width;
	const rawCropHeight = isFiniteNumber(editor.cropRegion?.height)
		? editor.cropRegion.height
		: DEFAULT_CROP_REGION.height;

	const cropX = clamp(rawCropX, 0, 1);
	const cropY = clamp(rawCropY, 0, 1);
	const cropWidth = clamp(rawCropWidth, 0.01, 1 - cropX);
	const cropHeight = clamp(rawCropHeight, 0.01, 1 - cropY);

	return {
		wallpaper: typeof editor.wallpaper === "string" ? editor.wallpaper : WALLPAPER_PATHS[0],
		shadowIntensity: typeof editor.shadowIntensity === "number" ? editor.shadowIntensity : 0,
		showBlur: typeof editor.showBlur === "boolean" ? editor.showBlur : false,
		motionBlurEnabled:
			typeof editor.motionBlurEnabled === "boolean" ? editor.motionBlurEnabled : false,
		connectZooms: typeof editor.connectZooms === "boolean" ? editor.connectZooms : true,
		zoomMotionBlur: isFiniteNumber(editor.zoomMotionBlur)
			? clamp(editor.zoomMotionBlur, 0, 1)
			: DEFAULT_ZOOM_MOTION_BLUR,
		borderRadius: typeof editor.borderRadius === "number" ? editor.borderRadius : 0,
		padding: isFiniteNumber(editor.padding) ? clamp(editor.padding, 0, 100) : 50,
		cropRegion: {
			x: cropX,
			y: cropY,
			width: cropWidth,
			height: cropHeight,
		},
		zoomRegions: normalizedZoomRegions,
		trimRegions: normalizedTrimRegions,
		speedRegions: normalizedSpeedRegions,
		annotationRegions: normalizedAnnotationRegions,
		aspectRatio:
			editor.aspectRatio && validAspectRatios.has(editor.aspectRatio) ? editor.aspectRatio : "16:9",
		exportQuality:
			editor.exportQuality === "medium" || editor.exportQuality === "source"
				? editor.exportQuality
				: "good",
		exportFormat: editor.exportFormat === "gif" ? "gif" : "mp4",
		gifFrameRate:
			editor.gifFrameRate === 15 ||
			editor.gifFrameRate === 20 ||
			editor.gifFrameRate === 25 ||
			editor.gifFrameRate === 30
				? editor.gifFrameRate
				: 15,
		gifLoop: typeof editor.gifLoop === "boolean" ? editor.gifLoop : true,
		gifSizePreset:
			editor.gifSizePreset === "medium" ||
			editor.gifSizePreset === "large" ||
			editor.gifSizePreset === "original"
				? editor.gifSizePreset
				: "medium",
		transcriptSegments: normalizedTranscriptSegments,
		captionSettings: normalizedCaptionSettings,
		cursorClickPulseSettings: normalizedCursorClickPulseSettings,
		keystrokeOverlaySettings: normalizedKeystrokeOverlaySettings,
	};
}

export function createProjectData(
	videoPath: string,
	editor: ProjectEditorState,
): EditorProjectData {
	return {
		version: PROJECT_VERSION,
		videoPath,
		editor,
	};
}
