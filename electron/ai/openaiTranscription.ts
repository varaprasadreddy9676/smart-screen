import fs from "node:fs/promises";
import path from "node:path";
import {
	normalizeTranscriptSegment,
	type ResolvedAIConfig,
	type TranscriptSegment,
} from "../../shared/ai";

interface FetchLike {
	(input: string, init?: RequestInit): Promise<Response>;
}

interface FileReaderLike {
	readFile(filePath: string): Promise<Buffer>;
}

type OpenAITranscriptionResponse = {
	text?: string;
	segments?: Array<{
		id?: string | number;
		start?: number;
		end?: number;
		text?: string;
		avg_logprob?: number;
	}>;
};

function getBaseUrl(config: ResolvedAIConfig) {
	return (config.baseUrl?.trim() || "https://api.openai.com/v1").replace(/\/+$/, "");
}

function scoreFromAverageLogProb(value: number | undefined) {
	if (typeof value !== "number" || Number.isNaN(value)) {
		return undefined;
	}

	return Math.max(0, Math.min(1, Math.exp(value)));
}

export async function transcribeVideoWithOpenAI(
	config: ResolvedAIConfig,
	videoPath: string,
	deps: {
		fetchImpl?: FetchLike;
		fileReader?: FileReaderLike;
	} = {},
): Promise<TranscriptSegment[]> {
	const fetchImpl = deps.fetchImpl ?? fetch;
	const fileReader = deps.fileReader ?? fs;
	const fileBuffer = await fileReader.readFile(videoPath);
	const formData = new FormData();
	formData.append("model", "whisper-1");
	formData.append("response_format", "verbose_json");
	formData.append("timestamp_granularities[]", "segment");
	formData.append(
		"file",
		new Blob([new Uint8Array(fileBuffer)], { type: "application/octet-stream" }),
		path.basename(videoPath),
	);

	const response = await fetchImpl(`${getBaseUrl(config)}/audio/transcriptions`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${config.apiKey ?? ""}`,
		},
		body: formData,
	});

	if (!response.ok) {
		const errorText = await response.text().catch(() => "");
		throw new Error(
			`OpenAI transcription failed with status ${response.status}${errorText ? `: ${errorText}` : "."}`,
		);
	}

	const payload = (await response.json()) as OpenAITranscriptionResponse;
	const segments = Array.isArray(payload.segments)
		? payload.segments
				.map((segment, index) =>
					normalizeTranscriptSegment(
						{
							id: segment.id ? `transcript-${segment.id}` : `transcript-${index + 1}`,
							startMs: Math.round((segment.start ?? 0) * 1000),
							endMs: Math.round((segment.end ?? segment.start ?? 0) * 1000),
							text: segment.text ?? "",
							confidence: scoreFromAverageLogProb(segment.avg_logprob),
						},
						index,
					),
				)
				.filter((segment): segment is TranscriptSegment => segment !== null)
		: [];

	if (segments.length > 0) {
		return segments;
	}

	const transcriptText = payload.text?.trim();
	if (transcriptText) {
		return [
			{
				id: "transcript-1",
				startMs: 0,
				endMs: 1,
				text: transcriptText,
			},
		];
	}

	throw new Error("OpenAI transcription returned no usable transcript segments.");
}
