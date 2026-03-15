import type {
	PublicAIConfig,
	SmartDemoAIAnalysisRequest,
	SmartDemoAISuggestion,
	TranscriptSanityWarning,
} from "@shared/ai";
import type { CursorTelemetryPoint } from "@/components/video-editor/types";
import { applySmartDemoAISuggestion } from "./applySmartDemoAISuggestion";
import { buildSmartDemoAIRequest } from "./buildSmartDemoAIRequest";
import { parseTranscriptFileContent } from "./transcriptFormats";

interface RunSpeechGroundedSmartDemoWorkflowOptions {
	config: PublicAIConfig;
	cursorTelemetry: CursorTelemetryPoint[];
	durationMs: number;
	userPrompt: string;
	transcriptContent: string;
	transcriptFileName: string;
	videoElement: HTMLVideoElement;
	aiAnalyze: (request: SmartDemoAIAnalysisRequest) => Promise<SmartDemoAISuggestion>;
	sampleFrames?: Parameters<typeof buildSmartDemoAIRequest>[0]["sampleFrames"];
}

export async function runSpeechGroundedSmartDemoWorkflow({
	config,
	cursorTelemetry,
	durationMs,
	userPrompt,
	transcriptContent,
	transcriptFileName,
	videoElement,
	aiAnalyze,
	sampleFrames,
}: RunSpeechGroundedSmartDemoWorkflowOptions): Promise<{
	request: SmartDemoAIAnalysisRequest;
	warnings: TranscriptSanityWarning[];
	suggestion: SmartDemoAISuggestion;
	applied: ReturnType<typeof applySmartDemoAISuggestion>;
}> {
	const transcriptSegments = parseTranscriptFileContent(transcriptContent, transcriptFileName);
	const request = await buildSmartDemoAIRequest({
		config,
		cursorTelemetry,
		durationMs,
		userPrompt,
		transcriptSegments,
		videoElement,
		sampleFrames,
	});
	const suggestion = await aiAnalyze(request);
	return {
		request,
		warnings: request.localAnalysis.transcriptWarnings,
		suggestion,
		applied: applySmartDemoAISuggestion(suggestion),
	};
}
