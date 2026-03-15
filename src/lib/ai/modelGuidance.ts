import type { AIProviderId, OllamaModelSummary } from "@shared/ai";

export interface AIModelGuidance {
	notes: string[];
	warnings: string[];
}

export interface RecommendedOllamaModel {
	name: string;
	reason: string;
}

const VISION_PATTERNS = [
	/\bllava\b/i,
	/\bbakllava\b/i,
	/\bmoondream\b/i,
	/\bminicpm-v\b/i,
	/\bqwen[\w.-]*vl\b/i,
	/\bvision\b/i,
	/\bgemma3\b/i,
];

const BASE_PATTERNS = [/\bbase\b/i, /-base\b/i];

function looksLikeBaseModel(model: string) {
	return BASE_PATTERNS.some((pattern) => pattern.test(model));
}

function looksLikeVisionModel(model: string) {
	return VISION_PATTERNS.some((pattern) => pattern.test(model));
}

function speedScore(sizeBytes: number) {
	if (sizeBytes <= 0) {
		return 0;
	}

	if (sizeBytes <= 3_000_000_000) {
		return 18;
	}

	if (sizeBytes <= 6_000_000_000) {
		return 12;
	}

	if (sizeBytes <= 10_000_000_000) {
		return 6;
	}

	return 0;
}

export function getAIModelGuidance(
	provider: AIProviderId,
	model: string,
	useVision: boolean,
): AIModelGuidance {
	const trimmedModel = model.trim();
	const warnings: string[] = [];
	const notes: string[] = [];

	if (!trimmedModel) {
		return { notes, warnings };
	}

	if (provider === "ollama") {
		if (looksLikeBaseModel(trimmedModel)) {
			warnings.push(
				"This looks like a base model. Base models often ignore instructions and may fail the app's strict JSON output contract.",
			);
		} else {
			notes.push(
				"This does not look like a base model, which is usually better for Smart Screen prompting.",
			);
		}

		const likelyVisionModel = looksLikeVisionModel(trimmedModel);
		if (useVision && !likelyVisionModel) {
			warnings.push(
				"Vision mode is enabled, but this model name does not look vision-capable. Text-only mode is the safer default unless you know the model supports images.",
			);
		}

		if (!useVision && likelyVisionModel) {
			notes.push(
				"This model name looks vision-capable. You can enable Vision mode if you want frame-aware analysis.",
			);
		}

		if (useVision && likelyVisionModel) {
			notes.push(
				"This model name looks vision-capable, so sampled frames are likely to be useful.",
			);
		}
	}

	if (provider === "openai") {
		if (useVision) {
			notes.push(
				"Vision mode is enabled, so sampled frames will be included in the analysis request.",
			);
		} else {
			notes.push(
				"Vision mode is off, so analysis will use only local heuristics plus your prompt.",
			);
		}
	}

	return { notes, warnings };
}

export function getRecommendedOllamaModels(
	models: OllamaModelSummary[],
	useVision: boolean,
): RecommendedOllamaModel[] {
	return [...models]
		.map((model) => {
			const base = looksLikeBaseModel(model.name);
			const vision = looksLikeVisionModel(model.name);
			let score = speedScore(model.sizeBytes);

			if (useVision) {
				score += vision ? 120 : -40;
				score += base ? -30 : 20;
			} else {
				score += vision ? 4 : 10;
				score += base ? -40 : 40;
			}

			let reason = "Installed locally.";
			if (useVision && vision) {
				reason = "Installed locally and looks vision-capable.";
			} else if (base) {
				reason = "Installed locally, but it looks like a base model.";
			} else if (!useVision) {
				reason = "Installed locally and looks instruction-friendly for text-only analysis.";
			}

			return {
				name: model.name,
				score,
				reason,
			};
		})
		.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
		.slice(0, 4)
		.map(({ name, reason }) => ({ name, reason }));
}

export function isInstalledOllamaModel(models: OllamaModelSummary[], modelName: string) {
	const normalized = modelName.trim();
	return normalized.length > 0 && models.some((model) => model.name === normalized);
}
