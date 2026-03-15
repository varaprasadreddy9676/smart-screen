import {
	type AIProviderId,
	type AIResult,
	err,
	normalizeSmartDemoAIAnalysisRequest,
	ok,
	type ResolvedAIConfig,
	type SmartDemoAISuggestion,
	type TranscriptSegment,
} from "../../shared/ai";
import { transcribeVideoWithOpenAI } from "./openaiTranscription";
import type { AIProvider } from "./providers/base";
import { OllamaProvider } from "./providers/ollama";
import { OpenAIProvider } from "./providers/openai";
import { aiConfigStore } from "./store";

const providers: Record<AIProviderId, AIProvider> = {
	openai: new OpenAIProvider(),
	ollama: new OllamaProvider(),
};

function getProvider(provider: AIProviderId) {
	return providers[provider];
}

async function getEnabledConfig(): Promise<ResolvedAIConfig> {
	const config = await aiConfigStore.getResolvedConfig();
	if (!config) {
		throw new Error("AI is not configured.");
	}

	if (!config.enabled) {
		throw new Error("AI is configured but disabled.");
	}

	return config;
}

export async function testStoredAIConnection(): Promise<AIResult<true>> {
	try {
		const config = await getEnabledConfig();
		await getProvider(config.provider).testConnection(config);
		return ok(true);
	} catch (error) {
		return err(error instanceof Error ? error.message : String(error));
	}
}

export async function runSmartDemoAIAnalysis(
	request: unknown,
): Promise<AIResult<SmartDemoAISuggestion>> {
	const normalizedRequest = normalizeSmartDemoAIAnalysisRequest(request);
	if (!normalizedRequest) {
		return err("Invalid Smart Screen AI request.");
	}

	try {
		const config = await getEnabledConfig();
		if (config.provider !== normalizedRequest.provider) {
			throw new Error("Saved AI provider does not match the requested provider.");
		}

		const provider = getProvider(config.provider);
		return ok(await provider.analyzeSmartDemo(config, normalizedRequest));
	} catch (error) {
		return err(error instanceof Error ? error.message : String(error));
	}
}

export async function transcribeVideoWithStoredAI(
	videoPath: string,
): Promise<AIResult<TranscriptSegment[]>> {
	try {
		const config = await getEnabledConfig();
		if (config.provider !== "openai") {
			throw new Error("Built-in transcription is currently available only for OpenAI.");
		}

		return ok(await transcribeVideoWithOpenAI(config, videoPath));
	} catch (error) {
		return err(error instanceof Error ? error.message : String(error));
	}
}
