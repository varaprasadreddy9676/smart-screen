import type { SmartDemoAISuggestion } from "@shared/ai";
import {
	clampFocusToDepth,
	type TrimRegion,
	type ZoomRegion,
} from "@/components/video-editor/types";

const MIN_AI_ZOOM_DURATION_MS = 700;
const MAX_AI_ZOOM_DURATION_MS = 1400;

export function isAIManagedRegionId(id: string) {
	return id.startsWith("ai-");
}

export function mapAISuggestionZoomRegions(suggestion: SmartDemoAISuggestion): ZoomRegion[] {
	return [...suggestion.zooms, ...suggestion.narrationLinkedZooms]
		.map((zoom) => {
			const startMs = Math.max(0, Math.round(zoom.startMs));
			const endMs = Math.min(
				startMs + MAX_AI_ZOOM_DURATION_MS,
				Math.max(startMs + MIN_AI_ZOOM_DURATION_MS, Math.round(zoom.endMs)),
			);
			return {
				id: zoom.id,
				startMs,
				endMs,
				depth: zoom.depth,
				focus: clampFocusToDepth(
					{
						cx: zoom.focus.cx,
						cy: zoom.focus.cy,
					},
					zoom.depth,
				),
			};
		})
		.sort((left, right) => left.startMs - right.startMs);
}

export function mapAISuggestionTrimRegions(suggestion: SmartDemoAISuggestion): TrimRegion[] {
	return suggestion.trims.map((trim) => ({
		id: trim.id,
		startMs: trim.startMs,
		endMs: trim.endMs,
	}));
}

export function applySmartDemoAISuggestion(suggestion: SmartDemoAISuggestion): {
	zoomRegions: ZoomRegion[];
	trimRegions: TrimRegion[];
} {
	return {
		zoomRegions: mapAISuggestionZoomRegions(suggestion),
		trimRegions: mapAISuggestionTrimRegions(suggestion),
	};
}
