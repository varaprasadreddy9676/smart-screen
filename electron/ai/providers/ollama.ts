import http from "node:http";
import https from "node:https";
import {
	normalizeSmartDemoAISuggestion,
	type ResolvedAIConfig,
	type SmartDemoAIAnalysisRequest,
	type SmartDemoAISuggestion,
} from "../../../shared/ai";
import { buildSmartDemoSystemPrompt, buildSmartDemoUserPrompt } from "../prompts";
import type { AIProvider } from "./base";

interface OllamaChatResponse {
	message?: {
		content?: string;
	};
}

interface NodeFetchResponse {
	ok: boolean;
	status: number;
	text(): Promise<string>;
	json(): Promise<unknown>;
}

function nodeFetch(
	url: string,
	options: { method?: string; headers?: Record<string, string>; body?: string },
): Promise<NodeFetchResponse> {
	return new Promise((resolve, reject) => {
		const parsed = new URL(url);
		const lib = parsed.protocol === "https:" ? https : http;
		const bodyBuffer = options.body ? Buffer.from(options.body, "utf-8") : undefined;
		const req = lib.request(
			{
				hostname: parsed.hostname,
				port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
				path: parsed.pathname + parsed.search,
				method: options.method ?? "GET",
				headers: {
					...(options.headers ?? {}),
					...(bodyBuffer ? { "Content-Length": String(bodyBuffer.length) } : {}),
				},
			},
			(res) => {
				const chunks: Buffer[] = [];
				res.on("data", (chunk: Buffer) => chunks.push(chunk));
				res.on("end", () => {
					const body = Buffer.concat(chunks).toString("utf-8");
					const status = res.statusCode ?? 0;
					resolve({
						ok: status >= 200 && status < 300,
						status,
						text: () => Promise.resolve(body),
						json: () => Promise.resolve(JSON.parse(body)),
					});
				});
			},
		);
		req.on("error", reject);
		if (bodyBuffer) {
			req.write(bodyBuffer);
		}
		req.end();
	});
}

function getBaseUrl(config: ResolvedAIConfig) {
	return (config.baseUrl?.trim() || "http://127.0.0.1:11434/api").replace(/\/+$/, "");
}

function toBase64Image(dataUrl: string) {
	const match = dataUrl.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/);
	return match?.[1] ?? dataUrl;
}

function buildUserMessage(request: SmartDemoAIAnalysisRequest, useVision: boolean) {
	return {
		role: "user",
		content: buildSmartDemoUserPrompt(request),
		...(useVision && request.sampledFrames.length > 0
			? { images: request.sampledFrames.map((frame) => toBase64Image(frame.dataUrl)) }
			: {}),
	};
}

export class OllamaProvider implements AIProvider {
	constructor(
		private readonly fetchImpl: (
			url: string,
			options: { method?: string; headers?: Record<string, string>; body?: string },
		) => Promise<NodeFetchResponse> = nodeFetch,
	) {}

	async testConnection(config: ResolvedAIConfig): Promise<void> {
		const headers: Record<string, string> = {};
		if (config.apiKey) {
			headers.Authorization = `Bearer ${config.apiKey}`;
		}

		const response = await this.fetchImpl(`${getBaseUrl(config)}/tags`, {
			method: "GET",
			headers,
		});

		if (!response.ok) {
			throw new Error(`Ollama connection failed with status ${response.status}.`);
		}
	}

	async analyzeSmartDemo(
		config: ResolvedAIConfig,
		request: SmartDemoAIAnalysisRequest,
	): Promise<SmartDemoAISuggestion> {
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
		};
		if (config.apiKey) {
			headers.Authorization = `Bearer ${config.apiKey}`;
		}

		const body = JSON.stringify({
			model: config.model,
			stream: false,
			format: "json",
			messages: [
				{
					role: "system",
					content: buildSmartDemoSystemPrompt(),
				},
				buildUserMessage(request, config.useVision),
			],
		});

		const response = await this.fetchImpl(`${getBaseUrl(config)}/chat`, {
			method: "POST",
			headers,
			body,
		});

		if (!response.ok) {
			const errorText = await response.text().catch(() => "");
			throw new Error(
				`Ollama analysis failed with status ${response.status}${errorText ? `: ${errorText}` : "."}`,
			);
		}

		const payload = (await response.json()) as OllamaChatResponse;
		const rawContent = payload.message?.content?.trim();
		if (!rawContent) {
			throw new Error("Ollama response did not contain message content.");
		}

		const suggestion = normalizeSmartDemoAISuggestion(JSON.parse(rawContent));
		if (!suggestion) {
			throw new Error("Ollama returned an invalid Smart Demo payload.");
		}

		return suggestion;
	}
}
