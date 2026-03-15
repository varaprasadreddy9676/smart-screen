import {
	isAIConfigReady,
	normalizePublicTranscriptionConfig,
	normalizeSaveAIConfigInput,
	normalizeSaveTranscriptionConfigInput,
	normalizeSmartDemoAIAnalysisRequest,
	normalizeSmartDemoAISuggestion,
	normalizeTranscriptSegment,
} from "./ai";

describe("shared/ai", () => {
	it("normalizes save config input and allows preserving an existing key", () => {
		expect(
			normalizeSaveAIConfigInput({
				provider: "openai",
				model: "gpt-5-mini",
				apiKey: "",
				enabled: true,
				useVision: true,
			}),
		).toEqual({
			provider: "openai",
			model: "gpt-5-mini",
			apiKey: "",
			enabled: true,
			baseUrl: undefined,
			useVision: true,
		});
	});

	it("accepts ollama config without an API key and reports readiness correctly", () => {
		const ollamaConfig = normalizeSaveAIConfigInput({
			provider: "ollama",
			model: "llama3.2",
			apiKey: "",
			enabled: true,
			useVision: false,
		});

		expect(ollamaConfig).toEqual({
			provider: "ollama",
			model: "llama3.2",
			apiKey: "",
			enabled: true,
			baseUrl: undefined,
			useVision: false,
		});

		expect(
			isAIConfigReady({
				provider: "ollama",
				enabled: true,
				hasKey: false,
				model: "llama3.2",
				useVision: false,
			}),
		).toBe(true);

		expect(
			isAIConfigReady({
				provider: "openai",
				enabled: true,
				hasKey: false,
				model: "gpt-5-mini",
				useVision: true,
			}),
		).toBe(false);
	});

	it("normalizes transcription config input", () => {
		expect(
			normalizeSaveTranscriptionConfigInput({
				provider: "macos-native",
				enabled: true,
			}),
		).toEqual({
			provider: "macos-native",
			enabled: true,
		});

		expect(
			normalizePublicTranscriptionConfig({
				provider: "auto",
				enabled: false,
			}),
		).toEqual({
			provider: "auto",
			enabled: false,
		});
	});

	it("normalizes smart demo AI analysis requests", () => {
		expect(
			normalizeSmartDemoAIAnalysisRequest({
				provider: "openai",
				model: "gpt-5-mini",
				userPrompt: " Summarize the demo ",
				durationMs: 12345,
				sampledFrames: [
					{
						timestampMs: 500,
						mimeType: "image/jpeg",
						dataUrl: "data:image/jpeg;base64,abc",
					},
				],
				transcriptSegments: [
					{
						startMs: 1000,
						endMs: 2200,
						text: "Click this button",
						confidence: 0.9,
					},
				],
				speechWindows: [
					{
						startMs: 1000,
						endMs: 2200,
						text: "Click this button",
						speakers: ["Narrator"],
						segmentIds: ["transcript-1"],
						averageConfidence: 0.9,
					},
				],
				localAnalysis: {
					steps: [
						{
							timestampMs: 2000,
							title: "Click Login",
							description: "Click the main login button",
						},
					],
					clicks: 3,
					silences: 1,
					zooms: 2,
					transcriptWarnings: [
						{
							message: "Transcript starts late.",
							severity: "warning",
						},
					],
					speechAnchors: [
						{
							startMs: 1000,
							endMs: 2200,
							text: "Click this button",
							referencedTarget: "Button",
							confidence: 0.8,
						},
					],
					narrationLinkedZooms: [
						{
							startMs: 900,
							endMs: 2500,
							focus: { cx: 0.5, cy: 0.5 },
							depth: 3,
							reason: "Narration and cursor align.",
							anchorId: "ai-anchor-1",
						},
					],
					focusMoments: [
						{
							timestampMs: 1500,
							title: "Button callout",
							reason: "Narration references the button.",
							anchorId: "ai-anchor-1",
							confidence: 0.8,
						},
					],
				},
			}),
		).toEqual({
			provider: "openai",
			model: "gpt-5-mini",
			userPrompt: "Summarize the demo",
			durationMs: 12345,
			sampledFrames: [
				{
					timestampMs: 500,
					mimeType: "image/jpeg",
					dataUrl: "data:image/jpeg;base64,abc",
				},
			],
			transcriptSegments: [
				{
					id: "transcript-1",
					startMs: 1000,
					endMs: 2200,
					text: "Click this button",
					confidence: 0.9,
				},
			],
			speechWindows: [
				{
					id: "speech-window-1",
					startMs: 1000,
					endMs: 2200,
					text: "Click this button",
					speakers: ["Narrator"],
					segmentIds: ["transcript-1"],
					averageConfidence: 0.9,
				},
			],
			localAnalysis: {
				steps: [
					{
						timestampMs: 2000,
						title: "Click Login",
						description: "Click the main login button",
					},
				],
				clicks: 3,
				silences: 1,
				zooms: 2,
				transcriptWarnings: [
					{
						id: "transcript-warning-1",
						message: "Transcript starts late.",
						severity: "warning",
					},
				],
				speechAnchors: [
					{
						id: "ai-anchor-1",
						startMs: 1000,
						endMs: 2200,
						text: "Click this button",
						referencedTarget: "Button",
						confidence: 0.8,
					},
				],
				narrationLinkedZooms: [
					{
						id: "ai-narration-zoom-1",
						startMs: 900,
						endMs: 2500,
						focus: { cx: 0.5, cy: 0.5 },
						depth: 3,
						reason: "Narration and cursor align.",
						anchorId: "ai-anchor-1",
					},
				],
				focusMoments: [
					{
						id: "ai-focus-1",
						timestampMs: 1500,
						title: "Button callout",
						reason: "Narration references the button.",
						anchorId: "ai-anchor-1",
						confidence: 0.8,
					},
				],
			},
		});
	});

	it("normalizes AI suggestions and clamps invalid numeric ranges", () => {
		expect(
			normalizeSmartDemoAISuggestion({
				summary: "Focus the onboarding path.",
				steps: [
					{
						timestampMs: 1200,
						title: "Open onboarding",
						description: "Show the first setup screen.",
						confidence: 3,
					},
				],
				zooms: [
					{
						startMs: -25,
						endMs: 800,
						focus: { cx: 3, cy: -1 },
						depth: 2,
						reason: "Focus the CTA",
					},
				],
				trims: [
					{
						startMs: 2000,
						endMs: 4000,
						reason: "Idle wait",
					},
				],
				speechAnchors: [
					{
						startMs: 900,
						endMs: 1600,
						text: "Click this button",
						referencedTarget: "Primary CTA",
						confidence: 1.4,
					},
				],
				narrationLinkedZooms: [
					{
						startMs: 850,
						endMs: 1700,
						focus: { cx: 0.5, cy: 0.25 },
						depth: 4,
						reason: "Narration calls out the CTA",
						anchorId: "ai-anchor-1",
					},
				],
				focusMoments: [
					{
						timestampMs: 1100,
						title: "CTA callout",
						reason: "Narration explicitly references the button",
						anchorId: "ai-anchor-1",
						confidence: -2,
					},
				],
			}),
		).toEqual({
			summary: "Focus the onboarding path.",
			steps: [
				{
					id: "ai-step-1",
					timestampMs: 1200,
					title: "Open onboarding",
					description: "Show the first setup screen.",
					confidence: 1,
				},
			],
			zooms: [
				{
					id: "ai-zoom-1",
					startMs: 0,
					endMs: 800,
					focus: { cx: 1, cy: 0 },
					depth: 2,
					reason: "Focus the CTA",
				},
			],
			trims: [
				{
					id: "ai-trim-1",
					startMs: 2000,
					endMs: 4000,
					reason: "Idle wait",
				},
			],
			speechAnchors: [
				{
					id: "ai-anchor-1",
					startMs: 900,
					endMs: 1600,
					text: "Click this button",
					referencedTarget: "Primary CTA",
					confidence: 1,
				},
			],
			narrationLinkedZooms: [
				{
					id: "ai-narration-zoom-1",
					startMs: 850,
					endMs: 1700,
					focus: { cx: 0.5, cy: 0.25 },
					depth: 4,
					reason: "Narration calls out the CTA",
					anchorId: "ai-anchor-1",
				},
			],
			focusMoments: [
				{
					id: "ai-focus-1",
					timestampMs: 1100,
					title: "CTA callout",
					reason: "Narration explicitly references the button",
					anchorId: "ai-anchor-1",
					confidence: 0,
				},
			],
		});
	});

	it("normalizes transcript segments and clamps confidence", () => {
		expect(
			normalizeTranscriptSegment({
				startMs: -100,
				endMs: 450,
				text: "Look at the chart",
				confidence: 3,
			}),
		).toEqual({
			id: "transcript-1",
			startMs: 0,
			endMs: 450,
			text: "Look at the chart",
			confidence: 1,
		});
	});
});
