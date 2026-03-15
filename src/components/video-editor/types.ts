export type ZoomDepth = 1 | 2 | 3 | 4 | 5 | 6;

export interface ZoomFocus {
	cx: number; // normalized horizontal center (0-1)
	cy: number; // normalized vertical center (0-1)
}

export interface ZoomRegion {
	id: string;
	startMs: number;
	endMs: number;
	depth: ZoomDepth;
	focus: ZoomFocus;
}

export interface CursorTelemetryPoint {
	timeMs: number;
	cx: number;
	cy: number;
	kind?: "move" | "click";
	button?: "left" | "right" | "middle" | "other";
	phase?: "down" | "up";
	source?: "sampled" | "native";
}

export interface KeystrokeTelemetryEvent {
	timeMs: number;
	text: string;
	source?: "native";
}

export function isClickTelemetryPoint(sample: CursorTelemetryPoint): boolean {
	return sample.kind === "click";
}

export function isMovementTelemetryPoint(sample: CursorTelemetryPoint): boolean {
	return sample.kind !== "click";
}

export interface TrimRegion {
	id: string;
	startMs: number;
	endMs: number;
}

export type AnnotationType = "text" | "image" | "figure";

export type ArrowDirection =
	| "up"
	| "down"
	| "left"
	| "right"
	| "up-right"
	| "up-left"
	| "down-right"
	| "down-left";

export interface FigureData {
	arrowDirection: ArrowDirection;
	color: string;
	strokeWidth: number;
}

export interface AnnotationPosition {
	x: number;
	y: number;
}

export interface AnnotationSize {
	width: number;
	height: number;
}

export interface AnnotationTextStyle {
	color: string;
	backgroundColor: string;
	fontSize: number; // pixels
	fontFamily: string;
	fontWeight: "normal" | "bold";
	fontStyle: "normal" | "italic";
	textDecoration: "none" | "underline";
	textAlign: "left" | "center" | "right";
}

export interface AnnotationRegion {
	id: string;
	startMs: number;
	endMs: number;
	type: AnnotationType;
	content: string; // Legacy - still used for current type
	textContent?: string; // Separate storage for text
	imageContent?: string; // Separate storage for image data URL
	position: AnnotationPosition;
	size: AnnotationSize;
	style: AnnotationTextStyle;
	zIndex: number;
	figureData?: FigureData;
}

export interface CaptionSettings {
	showInPreview: boolean;
	burnInDuringExport: boolean;
	fontSize: number; // base pixels at 1080p
	bottomOffset: number; // percent from bottom edge
	maxWidthPercent: number;
	textColor: string;
	backgroundColor: string;
}

export interface KeystrokeOverlaySettings {
	showInPreview: boolean;
	burnInDuringExport: boolean;
	durationMs: number;
	fontSize: number;
	bottomOffset: number;
	textColor: string;
	backgroundColor: string;
}

export interface CursorClickPulseSettings {
	showInPreview: boolean;
	burnInDuringExport: boolean;
	durationMs: number;
	size: number;
	color: string;
}

export const DEFAULT_ANNOTATION_POSITION: AnnotationPosition = {
	x: 50,
	y: 78,
};

export const DEFAULT_ANNOTATION_SIZE: AnnotationSize = {
	width: 30,
	height: 20,
};

export const DEFAULT_ANNOTATION_STYLE: AnnotationTextStyle = {
	color: "#ffffff",
	backgroundColor: "transparent",
	fontSize: 32,
	fontFamily: "Inter",
	fontWeight: "bold",
	fontStyle: "normal",
	textDecoration: "none",
	textAlign: "center",
};

export const DEFAULT_FIGURE_DATA: FigureData = {
	arrowDirection: "right",
	color: "#34B27B",
	strokeWidth: 4,
};

export const DEFAULT_CAPTION_SETTINGS: CaptionSettings = {
	showInPreview: true,
	burnInDuringExport: false,
	fontSize: 30,
	bottomOffset: 8,
	maxWidthPercent: 76,
	textColor: "#ffffff",
	backgroundColor: "rgba(0, 0, 0, 0.72)",
};

export const DEFAULT_ZOOM_MOTION_BLUR = 0.35;

export const DEFAULT_KEYSTROKE_OVERLAY_SETTINGS: KeystrokeOverlaySettings = {
	showInPreview: true,
	burnInDuringExport: true,
	durationMs: 1400,
	fontSize: 22,
	bottomOffset: 22,
	textColor: "#ffffff",
	backgroundColor: "rgba(15, 23, 42, 0.88)",
};

export const DEFAULT_CURSOR_CLICK_PULSE_SETTINGS: CursorClickPulseSettings = {
	showInPreview: true,
	burnInDuringExport: true,
	durationMs: 420,
	size: 1,
	color: "#34B27B",
};

export interface CropRegion {
	x: number;
	y: number;
	width: number;
	height: number;
}

export const DEFAULT_CROP_REGION: CropRegion = {
	x: 0,
	y: 0,
	width: 1,
	height: 1,
};

export type PlaybackSpeed = 0.25 | 0.5 | 0.75 | 1.25 | 1.5 | 1.75 | 2;

export interface SpeedRegion {
	id: string;
	startMs: number;
	endMs: number;
	speed: PlaybackSpeed;
}

export const SPEED_OPTIONS: Array<{ speed: PlaybackSpeed; label: string }> = [
	{ speed: 0.25, label: "0.25×" },
	{ speed: 0.5, label: "0.5×" },
	{ speed: 0.75, label: "0.75×" },
	{ speed: 1.25, label: "1.25×" },
	{ speed: 1.5, label: "1.5×" },
	{ speed: 1.75, label: "1.75×" },
	{ speed: 2, label: "2×" },
];

export const DEFAULT_PLAYBACK_SPEED: PlaybackSpeed = 1.5;

export const ZOOM_DEPTH_SCALES: Record<ZoomDepth, number> = {
	1: 1.25,
	2: 1.5,
	3: 1.8,
	4: 2.2,
	5: 3.5,
	6: 5.0,
};

export const DEFAULT_ZOOM_DEPTH: ZoomDepth = 3;

export function clampFocusToDepth(focus: ZoomFocus, _depth: ZoomDepth): ZoomFocus {
	return {
		cx: clamp(focus.cx, 0, 1),
		cy: clamp(focus.cy, 0, 1),
	};
}

function clamp(value: number, min: number, max: number) {
	if (Number.isNaN(value)) return (min + max) / 2;
	return Math.min(max, Math.max(min, value));
}
