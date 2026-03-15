import http from "node:http";
import https from "node:https";
import {
	type AIResult,
	err,
	normalizeOllamaModelListRequest,
	type OllamaModelListRequest,
	type OllamaModelSummary,
	ok,
} from "../../shared/ai";

interface OllamaTagsResponse {
	models?: Array<{
		name?: string;
		size?: number;
		modified_at?: string;
		details?: {
			family?: string;
			parameter_size?: string;
			quantization_level?: string;
		};
	}>;
}

function getBaseUrl(request: OllamaModelListRequest) {
	return (request.baseUrl?.trim() || "http://127.0.0.1:11434/api").replace(/\/+$/, "");
}

function nodeFetch(
	url: string,
	options: { headers?: Record<string, string> },
): Promise<{ ok: boolean; status: number; text(): Promise<string>; json(): Promise<unknown> }> {
	return new Promise((resolve, reject) => {
		const parsed = new URL(url);
		const lib = parsed.protocol === "https:" ? https : http;
		const req = lib.request(
			{
				hostname: parsed.hostname,
				port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
				path: parsed.pathname + parsed.search,
				method: "GET",
				headers: options.headers ?? {},
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
		req.end();
	});
}

export async function fetchOllamaModels(input: unknown): Promise<AIResult<OllamaModelSummary[]>> {
	return fetchOllamaModelsWith(input, nodeFetch);
}

export async function fetchOllamaModelsWith(
	input: unknown,
	fetchImpl: typeof nodeFetch,
): Promise<AIResult<OllamaModelSummary[]>> {
	const request = normalizeOllamaModelListRequest(input);
	const headers: Record<string, string> = {};

	if (request.apiKey) {
		headers.Authorization = `Bearer ${request.apiKey}`;
	}

	try {
		const response = await fetchImpl(`${getBaseUrl(request)}/tags`, { headers });

		if (!response.ok) {
			const errorText = await response.text().catch(() => "");
			return err(
				`Failed to load Ollama models (status ${response.status})${errorText ? `: ${errorText}` : "."}`,
			);
		}

		const payload = (await response.json()) as OllamaTagsResponse;
		const models = (payload.models ?? [])
			.filter(
				(model): model is NonNullable<OllamaTagsResponse["models"]>[number] =>
					typeof model?.name === "string",
			)
			.map((model) => ({
				name: model.name ?? "",
				sizeBytes: typeof model.size === "number" && Number.isFinite(model.size) ? model.size : 0,
				family: model.details?.family,
				parameterSize: model.details?.parameter_size,
				quantizationLevel: model.details?.quantization_level,
				modifiedAt: model.modified_at,
			}))
			.sort((a, b) => a.name.localeCompare(b.name));

		return ok(models);
	} catch (error) {
		return err(error instanceof Error ? error.message : String(error));
	}
}
