import {
	getAIModelGuidance,
	getRecommendedOllamaModels,
	isInstalledOllamaModel,
} from "./modelGuidance";

describe("getAIModelGuidance", () => {
	it("warns for likely base ollama models", () => {
		const guidance = getAIModelGuidance("ollama", "qwen2.5-coder:1.5b-base", false);
		expect(guidance.warnings.some((warning) => warning.includes("base model"))).toBe(true);
	});

	it("warns when vision mode is enabled on a likely text-only ollama model", () => {
		const guidance = getAIModelGuidance("ollama", "qwen3.5:2b", true);
		expect(
			guidance.warnings.some((warning) => warning.includes("does not look vision-capable")),
		).toBe(true);
	});

	it("notes likely vision models for ollama", () => {
		const guidance = getAIModelGuidance("ollama", "llava:7b", true);
		expect(guidance.notes.some((note) => note.includes("vision-capable"))).toBe(true);
	});

	it("shows openai vision mode guidance", () => {
		const guidance = getAIModelGuidance("openai", "gpt-5-mini", false);
		expect(guidance.notes).toEqual([
			"Vision mode is off, so analysis will use only local heuristics plus your prompt.",
		]);
	});

	it("recommends non-base installed models for text-only ollama use", () => {
		const recommendations = getRecommendedOllamaModels(
			[
				{ name: "qwen2.5-coder:1.5b-base", sizeBytes: 1_000_000_000 },
				{ name: "qwen3.5:2b", sizeBytes: 2_700_000_000 },
				{ name: "mistral:latest", sizeBytes: 4_300_000_000 },
			],
			false,
		);

		expect(recommendations[0]?.name).toBe("qwen3.5:2b");
		expect(recommendations.some((model) => model.name === "qwen2.5-coder:1.5b-base")).toBe(true);
	});

	it("recommends likely vision-capable installed models when vision is enabled", () => {
		const recommendations = getRecommendedOllamaModels(
			[
				{ name: "llava:7b", sizeBytes: 5_000_000_000 },
				{ name: "qwen3.5:2b", sizeBytes: 2_700_000_000 },
			],
			true,
		);

		expect(recommendations[0]).toEqual({
			name: "llava:7b",
			reason: "Installed locally and looks vision-capable.",
		});
	});

	it("checks whether a typed model exists in the installed list", () => {
		expect(isInstalledOllamaModel([{ name: "qwen3.5:2b", sizeBytes: 1 }], "qwen3.5:2b")).toBe(true);
		expect(isInstalledOllamaModel([{ name: "qwen3.5:2b", sizeBytes: 1 }], " qwen3.5:latest ")).toBe(
			false,
		);
	});
});
