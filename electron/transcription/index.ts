import type {
	AIResult,
	PublicTranscriptionConfig,
	ResolvedAIConfig,
	TranscriptionProviderId,
	TranscriptionProviderOption,
	TranscriptSegment,
} from "../../shared/ai";
import { err, ok } from "../../shared/ai";
import { aiConfigStore } from "../ai/store";
import type { TranscriptionContext, TranscriptionProvider } from "./providers/base";
import { MacOSNativeTranscriptionProvider } from "./providers/macosNative";
import { OpenAITranscriptionProvider } from "./providers/openai";
import { transcriptionConfigStore } from "./store";

interface TranscriptionConfigStoreLike {
	getConfig(): Promise<PublicTranscriptionConfig>;
}

interface AIConfigStoreLike {
	getResolvedConfig(): Promise<ResolvedAIConfig | null>;
}

const defaultProviders: Record<Exclude<TranscriptionProviderId, "auto">, TranscriptionProvider> = {
	"macos-native": new MacOSNativeTranscriptionProvider(),
	openai: new OpenAITranscriptionProvider(),
};

export function createTranscriptionService({
	providers = defaultProviders,
	aiStore = aiConfigStore,
	configStore = transcriptionConfigStore,
}: {
	providers?: Record<Exclude<TranscriptionProviderId, "auto">, TranscriptionProvider>;
	aiStore?: AIConfigStoreLike;
	configStore?: TranscriptionConfigStoreLike;
} = {}) {
	async function getContext(): Promise<TranscriptionContext> {
		return {
			aiConfig: await aiStore.getResolvedConfig(),
		};
	}

	async function getProviderOptions(
		context: TranscriptionContext,
	): Promise<TranscriptionProviderOption[]> {
		const concreteOptions: TranscriptionProviderOption[] = [];

		for (const provider of Object.values(providers)) {
			const availability = await provider.isAvailable(context);
			concreteOptions.push({
				id: provider.id,
				label: provider.label,
				available: availability.available,
				reason: availability.reason,
			});
		}

		const anyConcreteAvailable = concreteOptions.some((option) => option.available);

		return [
			{
				id: "auto",
				label: "Auto",
				available: anyConcreteAvailable,
				reason: anyConcreteAvailable
					? "Prefer macOS native transcription when available, otherwise fall back to OpenAI."
					: "No transcription backend is currently available.",
			},
			...concreteOptions,
		];
	}

	async function resolveProvider(
		preference: TranscriptionProviderId,
		context: TranscriptionContext,
	): Promise<TranscriptionProvider> {
		if (preference !== "auto") {
			const provider = providers[preference];
			const availability = await provider.isAvailable(context);
			if (!availability.available) {
				throw new Error(availability.reason ?? `${provider.label} transcription is unavailable.`);
			}
			return provider;
		}

		const preferenceOrder: Array<Exclude<TranscriptionProviderId, "auto">> = [
			"macos-native",
			"openai",
		];
		for (const providerId of preferenceOrder) {
			const provider = providers[providerId];
			const availability = await provider.isAvailable(context);
			if (availability.available) {
				return provider;
			}
		}

		throw new Error("No transcription backend is currently available.");
	}

	return {
		async getTranscriptionConfigResult(): Promise<AIResult<PublicTranscriptionConfig>> {
			try {
				return ok(await configStore.getConfig());
			} catch (error) {
				return err(error instanceof Error ? error.message : String(error));
			}
		},

		async getTranscriptionProviderOptionsResult(): Promise<
			AIResult<TranscriptionProviderOption[]>
		> {
			try {
				return ok(await getProviderOptions(await getContext()));
			} catch (error) {
				return err(error instanceof Error ? error.message : String(error));
			}
		},

		async transcribeVideoResult(input: unknown): Promise<AIResult<TranscriptSegment[]>> {
			try {
				if (
					typeof input !== "object" ||
					input === null ||
					typeof (input as { videoPath?: unknown }).videoPath !== "string"
				) {
					throw new Error("Invalid transcription request.");
				}

				const context = await getContext();
				const config = await configStore.getConfig();
				const providerPreference =
					typeof (input as { provider?: unknown }).provider === "string"
						? ((input as { provider?: TranscriptionProviderId }).provider ?? config.provider)
						: config.provider;
				const provider = await resolveProvider(providerPreference, context);
				return ok(await provider.transcribe((input as { videoPath: string }).videoPath, context));
			} catch (error) {
				return err(error instanceof Error ? error.message : String(error));
			}
		},
	};
}

const service = createTranscriptionService();

export const getTranscriptionConfigResult = service.getTranscriptionConfigResult;
export const getTranscriptionProviderOptionsResult = service.getTranscriptionProviderOptionsResult;
export const transcribeVideoResult = service.transcribeVideoResult;
