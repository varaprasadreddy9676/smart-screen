import type {
	ResolvedAIConfig,
	TranscriptionProviderId,
	TranscriptSegment,
} from "../../../shared/ai";

export interface TranscriptionContext {
	aiConfig: ResolvedAIConfig | null;
}

export interface TranscriptionProvider {
	id: Exclude<TranscriptionProviderId, "auto">;
	label: string;
	isAvailable(context: TranscriptionContext): Promise<{ available: boolean; reason?: string }>;
	transcribe(videoPath: string, context: TranscriptionContext): Promise<TranscriptSegment[]>;
}
