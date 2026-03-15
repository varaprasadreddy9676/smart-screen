import type { TranscriptSegment } from "@shared/ai";
import type { Range, Span } from "dnd-timeline";
import type { AnnotationRegion, SpeedRegion, TrimRegion, ZoomRegion } from "../types";

export const ZOOM_ROW_ID = "row-zoom";
export const TRIM_ROW_ID = "row-trim";
export const ANNOTATION_ROW_ID = "row-annotation";
export const SPEED_ROW_ID = "row-speed";
export const CAPTION_ROW_ID = "row-caption";
const MIN_VISIBLE_OVERSCAN_MS = 1200;
const MAX_VISIBLE_OVERSCAN_MS = 8000;
const VISIBLE_OVERSCAN_RATIO = 0.2;

export interface TimelineRenderItem {
	id: string;
	rowId: string;
	span: Span;
	label: string;
	zoomDepth?: number;
	speedValue?: number;
	variant: "zoom" | "trim" | "annotation" | "speed" | "caption";
}

export interface TimelinePartitionedItems {
	zoomItems: TimelineRenderItem[];
	trimItems: TimelineRenderItem[];
	annotationItems: TimelineRenderItem[];
	speedItems: TimelineRenderItem[];
	captionItems: TimelineRenderItem[];
}

function getAnnotationLabel(region: AnnotationRegion) {
	if (region.type === "text") {
		const preview = region.content.trim() || "Empty text";
		return preview.length > 20 ? `${preview.substring(0, 20)}...` : preview;
	}

	if (region.type === "image") {
		return "Image";
	}

	return "Annotation";
}

export function buildTimelineItems({
	zoomRegions,
	trimRegions,
	annotationRegions,
	speedRegions,
	captionSegments = [],
}: {
	zoomRegions: ZoomRegion[];
	trimRegions: TrimRegion[];
	annotationRegions: AnnotationRegion[];
	speedRegions: SpeedRegion[];
	captionSegments?: TranscriptSegment[];
}): TimelineRenderItem[] {
	const zooms: TimelineRenderItem[] = zoomRegions.map((region, index) => ({
		id: region.id,
		rowId: ZOOM_ROW_ID,
		span: { start: region.startMs, end: region.endMs },
		label: `Zoom ${index + 1}`,
		zoomDepth: region.depth,
		variant: "zoom",
	}));

	const trims: TimelineRenderItem[] = trimRegions.map((region, index) => ({
		id: region.id,
		rowId: TRIM_ROW_ID,
		span: { start: region.startMs, end: region.endMs },
		label: `Trim ${index + 1}`,
		variant: "trim",
	}));

	const annotations: TimelineRenderItem[] = annotationRegions.map((region) => ({
		id: region.id,
		rowId: ANNOTATION_ROW_ID,
		span: { start: region.startMs, end: region.endMs },
		label: getAnnotationLabel(region),
		variant: "annotation",
	}));

	const speeds: TimelineRenderItem[] = speedRegions.map((region, index) => ({
		id: region.id,
		rowId: SPEED_ROW_ID,
		span: { start: region.startMs, end: region.endMs },
		label: `Speed ${index + 1}`,
		speedValue: region.speed,
		variant: "speed",
	}));

	const captions: TimelineRenderItem[] = captionSegments.map((segment) => ({
		id: segment.id,
		rowId: CAPTION_ROW_ID,
		span: { start: segment.startMs, end: segment.endMs },
		label: segment.text.length > 30 ? `${segment.text.substring(0, 30)}\u2026` : segment.text,
		variant: "caption",
	}));

	return [...zooms, ...trims, ...annotations, ...speeds, ...captions];
}

export function buildTimelineRegionSpans({
	zoomRegions,
	trimRegions,
	speedRegions,
}: {
	zoomRegions: ZoomRegion[];
	trimRegions: TrimRegion[];
	speedRegions: SpeedRegion[];
}) {
	const zooms = zoomRegions.map((region) => ({
		id: region.id,
		start: region.startMs,
		end: region.endMs,
	}));
	const trims = trimRegions.map((region) => ({
		id: region.id,
		start: region.startMs,
		end: region.endMs,
	}));
	const speeds = speedRegions.map((region) => ({
		id: region.id,
		start: region.startMs,
		end: region.endMs,
	}));

	return [...zooms, ...trims, ...speeds];
}

export function getVisibleTimelineOverscanMs(range: Range) {
	const visibleDuration = Math.max(0, range.end - range.start);
	return Math.max(
		MIN_VISIBLE_OVERSCAN_MS,
		Math.min(MAX_VISIBLE_OVERSCAN_MS, Math.round(visibleDuration * VISIBLE_OVERSCAN_RATIO)),
	);
}

export function filterTimelineItemsByRange(items: TimelineRenderItem[], range: Range) {
	const overscanMs = getVisibleTimelineOverscanMs(range);
	const visibleStart = Math.max(0, range.start - overscanMs);
	const visibleEnd = range.end + overscanMs;

	return items.filter((item) => item.span.end >= visibleStart && item.span.start <= visibleEnd);
}

export function partitionTimelineItems(items: TimelineRenderItem[]): TimelinePartitionedItems {
	const partitioned: TimelinePartitionedItems = {
		zoomItems: [],
		trimItems: [],
		annotationItems: [],
		speedItems: [],
		captionItems: [],
	};

	for (const item of items) {
		switch (item.rowId) {
			case ZOOM_ROW_ID:
				partitioned.zoomItems.push(item);
				break;
			case TRIM_ROW_ID:
				partitioned.trimItems.push(item);
				break;
			case ANNOTATION_ROW_ID:
				partitioned.annotationItems.push(item);
				break;
			case SPEED_ROW_ID:
				partitioned.speedItems.push(item);
				break;
			case CAPTION_ROW_ID:
				partitioned.captionItems.push(item);
				break;
		}
	}

	return partitioned;
}
