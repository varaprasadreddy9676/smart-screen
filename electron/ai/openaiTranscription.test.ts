import type { ResolvedAIConfig } from "../../shared/ai";
import { transcribeVideoWithOpenAI } from "./openaiTranscription";

describe("transcribeVideoWithOpenAI", () => {
	const config: ResolvedAIConfig = {
		provider: "openai",
		model: "gpt-5-mini",
		apiKey: "sk-test",
		enabled: true,
		useVision: false,
	};

	it("maps verbose_json segments into normalized transcript segments", async () => {
		const fetchImpl = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						segments: [
							{
								id: 11,
								start: 0.5,
								end: 1.8,
								text: "Click this button",
								avg_logprob: -0.1,
							},
						],
					}),
					{ status: 200 },
				),
		);
		const fileReader = {
			readFile: vi.fn(async () => Buffer.from("video-bytes")),
		};

		await expect(
			transcribeVideoWithOpenAI(config, "/tmp/demo.webm", { fetchImpl, fileReader }),
		).resolves.toEqual([
			{
				id: "transcript-11",
				startMs: 500,
				endMs: 1800,
				text: "Click this button",
				confidence: expect.any(Number),
			},
		]);

		expect(fetchImpl).toHaveBeenCalledTimes(1);
		expect(fetchImpl.mock.calls[0]?.[0]).toBe("https://api.openai.com/v1/audio/transcriptions");
	});

	it("fails on non-OK responses with the provider error body", async () => {
		const fetchImpl = vi.fn(async () => new Response("bad request", { status: 400 }));
		const fileReader = {
			readFile: vi.fn(async () => Buffer.from("video-bytes")),
		};

		await expect(
			transcribeVideoWithOpenAI(config, "/tmp/demo.webm", { fetchImpl, fileReader }),
		).rejects.toThrow("OpenAI transcription failed with status 400: bad request");
	});
});
