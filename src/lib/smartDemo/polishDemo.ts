import type { SmartDemoAISuggestion, TranscriptSegment } from "@shared/ai";
import type {
	AnnotationRegion,
	CaptionSettings,
	CursorTelemetryPoint,
	TrimRegion,
	ZoomRegion,
} from "@/components/video-editor/types";
import {
	mapAISuggestionTrimRegions,
	mapAISuggestionZoomRegions,
} from "@/lib/ai/applySmartDemoAISuggestion";
import { buildAutoZoomRegions } from "@/smart-demo/effects/autoZoom";
import { buildClickHighlights } from "@/smart-demo/effects/clickHighlight";
import { detectSilence, getSuggestedTrimRegions } from "@/smart-demo/inactivityDetector";
import { analyzeInteractions } from "@/smart-demo/interactionRecorder";
import { analyzeTimeline } from "@/smart-demo/timelineAnalyzer";

export interface DemoPolishPlan {
	zoomRegions: ZoomRegion[];
	trimRegions: TrimRegion[];
	annotationRegions: AnnotationRegion[];
	captionSettings: CaptionSettings;
	zoomSource: "ai" | "local" | "none";
	trimSource: "ai" | "local" | "none";
}

interface BuildDemoPolishPlanInput {
	cursorTelemetry: CursorTelemetryPoint[];
	durationMs: number;
	aiSuggestion: SmartDemoAISuggestion | null;
	transcriptSegments: TranscriptSegment[];
	captionSettings: CaptionSettings;
}

export function buildDemoPolishPlan({
	cursorTelemetry,
	durationMs,
	aiSuggestion,
	transcriptSegments,
	captionSettings,
}: BuildDemoPolishPlanInput): DemoPolishPlan {
	const events = analyzeInteractions(cursorTelemetry);
	const segments = analyzeTimeline(events);
	const localZoomRegions = buildAutoZoomRegions(segments);
	const localAnnotationRegions = buildClickHighlights(segments, { transcriptSegments });
	const localTrimRegions = getSuggestedTrimRegions(detectSilence(cursorTelemetry), durationMs).map(
		(segment, index) => ({
			id: `smart-trim-${index + 1}`,
			startMs: segment.startMs,
			endMs: segment.endMs,
		}),
	);

	const aiZoomRegions = aiSuggestion ? mapAISuggestionZoomRegions(aiSuggestion) : [];
	const aiTrimRegions = aiSuggestion ? mapAISuggestionTrimRegions(aiSuggestion) : [];

	const zoomRegions = aiZoomRegions.length > 0 ? aiZoomRegions : localZoomRegions;
	const trimRegions = aiTrimRegions.length > 0 ? aiTrimRegions : localTrimRegions;

	return {
		zoomRegions,
		trimRegions,
		annotationRegions: localAnnotationRegions,
		captionSettings:
			transcriptSegments.length > 0
				? {
						...captionSettings,
						showInPreview: true,
						burnInDuringExport: true,
					}
				: captionSettings,
		zoomSource: aiZoomRegions.length > 0 ? "ai" : localZoomRegions.length > 0 ? "local" : "none",
		trimSource: aiTrimRegions.length > 0 ? "ai" : localTrimRegions.length > 0 ? "local" : "none",
	};
}
