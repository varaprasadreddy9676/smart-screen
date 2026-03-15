import {
	normalizeSmartDemoAISuggestion,
	type ResolvedAIConfig,
	type SmartDemoAIAnalysisRequest,
	type SmartDemoAISuggestion,
} from "../../../shared/ai";
import { buildSmartDemoSystemPrompt, buildSmartDemoUserPrompt } from "../prompts";
import type { AIProvider } from "./base";

interface FetchLike {
	(input: string, init?: RequestInit): Promise<Response>;
}

type OpenAIResponse = {
	output_text?: string;
	output?: Array<{
		content?: Array<{
			type?: string;
			text?: string;
		}>;
	}>;
};

function getBaseUrl(config: ResolvedAIConfig) {
	return (config.baseUrl?.trim() || "https://api.openai.com/v1").replace(/\/+$/, "");
}

function extractOutputText(payload: OpenAIResponse): string {
	if (typeof payload.output_text === "string" && payload.output_text.trim().length > 0) {
		return payload.output_text.trim();
	}

	const text = payload.output
		?.flatMap((item) => item.content ?? [])
		.find((content) => content.type === "output_text" && typeof content.text === "string")?.text;

	if (text && text.trim().length > 0) {
		return text.trim();
	}

	throw new Error("OpenAI response did not contain output text.");
}

function buildInputContent(request: SmartDemoAIAnalysisRequest) {
	const content: Array<Record<string, unknown>> = [
		{
			type: "input_text",
			text: buildSmartDemoUserPrompt(request),
		},
	];

	for (const frame of request.sampledFrames) {
		content.push({
			type: "input_image",
			image_url: frame.dataUrl,
		});
	}

	return content;
}

export class OpenAIProvider implements AIProvider {
	constructor(private readonly fetchImpl: FetchLike = fetch) {}

	async testConnection(config: ResolvedAIConfig): Promise<void> {
		const response = await this.fetchImpl(`${getBaseUrl(config)}/models`, {
			method: "GET",
			headers: {
				Authorization: `Bearer ${config.apiKey ?? ""}`,
			},
		});

		if (!response.ok) {
			throw new Error(`OpenAI connection failed with status ${response.status}.`);
		}
	}

	async analyzeSmartDemo(
		config: ResolvedAIConfig,
		request: SmartDemoAIAnalysisRequest,
	): Promise<SmartDemoAISuggestion> {
		const response = await this.fetchImpl(`${getBaseUrl(config)}/responses`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${config.apiKey ?? ""}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				model: config.model,
				input: [
					{
						role: "developer",
						content: [
							{
								type: "input_text",
								text: buildSmartDemoSystemPrompt(),
							},
						],
					},
					{
						role: "user",
						content: config.useVision
							? buildInputContent(request)
							: buildInputContent({ ...request, sampledFrames: [] }),
					},
				],
			}),
		});

		if (!response.ok) {
			const errorText = await response.text().catch(() => "");
			throw new Error(
				`OpenAI analysis failed with status ${response.status}${errorText ? `: ${errorText}` : "."}`,
			);
		}

		const payload = (await response.json()) as OpenAIResponse;
		const suggestion = normalizeSmartDemoAISuggestion(JSON.parse(extractOutputText(payload)));
		if (!suggestion) {
			throw new Error("OpenAI returned an invalid Smart Demo payload.");
		}

		return suggestion;
	}
}
