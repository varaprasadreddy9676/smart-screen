import type {
	AIProviderId,
	PublicAIConfig,
	SmartDemoAIAnalysisRequest,
	TranscriptSegment,
} from "@shared/ai";
import type { CursorTelemetryPoint } from "@/components/video-editor/types";
import { buildAutoZoomRegions } from "@/smart-demo/effects/autoZoom";
import { detectSilence, getSuggestedTrimRegions } from "@/smart-demo/inactivityDetector";
import { analyzeInteractions } from "@/smart-demo/interactionRecorder";
import { generateSteps } from "@/smart-demo/stepGenerator";
import { analyzeTimeline } from "@/smart-demo/timelineAnalyzer";
import { sampleFramesFromVideo } from "./frameSampler";
import { analyzeSpeechGrounding } from "./speechGrounding";
import { buildSpeechWindows } from "./speechWindows";

interface BuildSmartDemoAIRequestOptions {
	config: PublicAIConfig;
	cursorTelemetry: CursorTelemetryPoint[];
	durationMs: number;
	userPrompt: string;
	transcriptSegments?: TranscriptSegment[];
	videoElement: HTMLVideoElement;
	sampleFrames?: typeof sampleFramesFromVideo;
}

export async function buildSmartDemoAIRequest({
	config,
	cursorTelemetry,
	durationMs,
	userPrompt,
	transcriptSegments = [],
	videoElement,
	sampleFrames = sampleFramesFromVideo,
}: BuildSmartDemoAIRequestOptions): Promise<SmartDemoAIAnalysisRequest> {
	const interactions = analyzeInteractions(cursorTelemetry);
	const segments = analyzeTimeline(interactions);
	const steps = generateSteps(segments);
	const zoomRegions = buildAutoZoomRegions(segments);
	const silenceSegments = getSuggestedTrimRegions(detectSilence(cursorTelemetry), durationMs);
	const sampledFrames = config.useVision ? await sampleFrames(videoElement) : [];
	const speechWindows = buildSpeechWindows(transcriptSegments);
	const speechGrounding = analyzeSpeechGrounding({
		transcriptSegments,
		cursorTelemetry,
		durationMs,
	});

	return {
		provider: config.provider as AIProviderId,
		model: config.model,
		userPrompt: userPrompt.trim(),
		durationMs,
		sampledFrames,
		transcriptSegments,
		speechWindows,
		localAnalysis: {
			steps: steps.map((step) => ({
				timestampMs: Math.round(step.timestamp * 1000),
				title: step.title,
				description: step.description,
			})),
			clicks: interactions.filter((event) => event.type === "click").length,
			silences: silenceSegments.length,
			zooms: zoomRegions.length,
			transcriptWarnings: speechGrounding.warnings,
			speechAnchors: speechGrounding.speechAnchors,
			narrationLinkedZooms: speechGrounding.narrationLinkedZooms,
			focusMoments: speechGrounding.focusMoments,
		},
	};
}
