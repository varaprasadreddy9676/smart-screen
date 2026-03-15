import type { ResolvedAIConfig } from "../../shared/ai";
import { createTranscriptionService } from "./index";
import type { TranscriptionProvider } from "./providers/base";

describe("transcription service", () => {
	const macProvider: TranscriptionProvider = {
		id: "macos-native",
		label: "macOS Native",
		async isAvailable() {
			return { available: true };
		},
		async transcribe() {
			return [{ id: "transcript-1", startMs: 0, endMs: 1000, text: "Hello world" }];
		},
	};

	const unavailableOpenAIProvider: TranscriptionProvider = {
		id: "openai",
		label: "OpenAI",
		async isAvailable() {
			return { available: false, reason: "No OpenAI key" };
		},
		async transcribe() {
			throw new Error("should not be called");
		},
	};

	const aiStore = {
		async getResolvedConfig(): Promise<ResolvedAIConfig | null> {
			return null;
		},
	};

	it("prefers macOS native when auto mode is selected", async () => {
		const service = createTranscriptionService({
			providers: {
				"macos-native": macProvider,
				openai: unavailableOpenAIProvider,
			},
			aiStore,
			configStore: {
				async getConfig() {
					return { provider: "auto" as const, enabled: true };
				},
			},
		});

		await expect(service.transcribeVideoResult({ videoPath: "/tmp/demo.webm" })).resolves.toEqual({
			success: true,
			data: [{ id: "transcript-1", startMs: 0, endMs: 1000, text: "Hello world" }],
		});
	});

	it("reports unavailable explicit providers with their reason", async () => {
		const service = createTranscriptionService({
			providers: {
				"macos-native": macProvider,
				openai: unavailableOpenAIProvider,
			},
			aiStore,
			configStore: {
				async getConfig() {
					return { provider: "openai" as const, enabled: true };
				},
			},
		});

		await expect(service.transcribeVideoResult({ videoPath: "/tmp/demo.webm" })).resolves.toEqual({
			success: false,
			error: "No OpenAI key",
		});
	});

	it("marks auto unavailable when no concrete backend is available", async () => {
		const service = createTranscriptionService({
			providers: {
				"macos-native": {
					...macProvider,
					async isAvailable() {
						return { available: false, reason: "Not packaged" };
					},
				},
				openai: unavailableOpenAIProvider,
			},
			aiStore,
			configStore: {
				async getConfig() {
					return { provider: "auto" as const, enabled: true };
				},
			},
		});

		await expect(service.getTranscriptionProviderOptionsResult()).resolves.toEqual({
			success: true,
			data: [
				{
					id: "auto",
					label: "Auto",
					available: false,
					reason: "No transcription backend is currently available.",
				},
				{
					id: "macos-native",
					label: "macOS Native",
					available: false,
					reason: "Not packaged",
				},
				{
					id: "openai",
					label: "OpenAI",
					available: false,
					reason: "No OpenAI key",
				},
			],
		});
	});
});
