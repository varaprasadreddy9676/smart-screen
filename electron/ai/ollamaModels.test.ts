import { fetchOllamaModelsWith } from "./ollamaModels";

describe("fetchOllamaModels", () => {
	it("parses and sorts installed Ollama models", async () => {
		const result = await fetchOllamaModelsWith(
			{ baseUrl: "http://127.0.0.1:11434/api" },
			async () =>
				new Response(
					JSON.stringify({
						models: [
							{
								name: "z-model",
								size: 10,
								modified_at: "2026-01-01T00:00:00Z",
								details: { family: "llama", parameter_size: "7B", quantization_level: "Q4_K_M" },
							},
							{
								name: "a-model",
								size: 20,
								details: { family: "qwen", parameter_size: "2B", quantization_level: "Q8_0" },
							},
						],
					}),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				),
		);

		expect(result).toEqual({
			success: true,
			data: [
				{
					name: "a-model",
					sizeBytes: 20,
					family: "qwen",
					parameterSize: "2B",
					quantizationLevel: "Q8_0",
					modifiedAt: undefined,
				},
				{
					name: "z-model",
					sizeBytes: 10,
					family: "llama",
					parameterSize: "7B",
					quantizationLevel: "Q4_K_M",
					modifiedAt: "2026-01-01T00:00:00Z",
				},
			],
		});
	});
});
