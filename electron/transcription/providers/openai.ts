import type { TranscriptSegment } from "../../../shared/ai";
import { transcribeVideoWithOpenAI } from "../../ai/openaiTranscription";
import type { TranscriptionContext, TranscriptionProvider } from "./base";

export class OpenAITranscriptionProvider implements TranscriptionProvider {
	readonly id = "openai" as const;
	readonly label = "OpenAI";

	async isAvailable(context: TranscriptionContext) {
		if (!context.aiConfig?.enabled) {
			return { available: false, reason: "OpenAI AI settings are disabled." };
		}

		if (context.aiConfig.provider !== "openai") {
			return {
				available: false,
				reason: "Select OpenAI in AI settings to use OpenAI transcription.",
			};
		}

		if (!context.aiConfig.apiKey) {
			return { available: false, reason: "Store an OpenAI API key to use OpenAI transcription." };
		}

		return { available: true };
	}

	async transcribe(videoPath: string, context: TranscriptionContext): Promise<TranscriptSegment[]> {
		if (!context.aiConfig || context.aiConfig.provider !== "openai") {
			throw new Error("OpenAI transcription requires an enabled OpenAI AI configuration.");
		}

		return await transcribeVideoWithOpenAI(context.aiConfig, videoPath);
	}
}
