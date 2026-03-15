import type { CursorTelemetryPoint } from "@/components/video-editor/types";
import { buildSmartDemoAIRequest } from "./buildSmartDemoAIRequest";

describe("buildSmartDemoAIRequest", () => {
	it("builds a request from local analysis and sampled frames", async () => {
		const cursorTelemetry: CursorTelemetryPoint[] = [
			{ timeMs: 0, cx: 0.1, cy: 0.1 },
			{ timeMs: 100, cx: 0.3, cy: 0.3 },
			{ timeMs: 200, cx: 0.3, cy: 0.3 },
			{ timeMs: 400, cx: 0.3, cy: 0.3 },
			{ timeMs: 700, cx: 0.6, cy: 0.6 },
			{ timeMs: 1800, cx: 0.6, cy: 0.6 },
			{ timeMs: 2000, cx: 0.8, cy: 0.8 },
		];

		const request = await buildSmartDemoAIRequest({
			config: {
				provider: "openai",
				model: "gpt-5-mini",
				enabled: true,
				hasKey: true,
				useVision: true,
			},
			cursorTelemetry,
			durationMs: 2500,
			userPrompt: " tighten this into a product walkthrough ",
			transcriptSegments: [
				{
					id: "transcript-1",
					startMs: 900,
					endMs: 1800,
					text: "Now click this button",
					confidence: 0.8,
				},
			],
			videoElement: {} as HTMLVideoElement,
			sampleFrames: async () => [
				{
					timestampMs: 500,
					mimeType: "image/jpeg",
					dataUrl: "data:image/jpeg;base64,abc",
				},
			],
		});

		expect(request.provider).toBe("openai");
		expect(request.model).toBe("gpt-5-mini");
		expect(request.userPrompt).toBe("tighten this into a product walkthrough");
		expect(request.durationMs).toBe(2500);
		expect(request.sampledFrames).toHaveLength(1);
		expect(request.transcriptSegments).toHaveLength(1);
		expect(request.speechWindows).toEqual([
			{
				id: "speech-window-1",
				startMs: 900,
				endMs: 1800,
				text: "Now click this button",
				speakers: [],
				averageConfidence: 0.8,
				segmentIds: ["transcript-1"],
			},
		]);
		expect(request.localAnalysis.speechAnchors).toHaveLength(1);
		expect(request.localAnalysis.narrationLinkedZooms).toHaveLength(1);
		expect(request.localAnalysis.focusMoments).toHaveLength(1);
		expect(request.localAnalysis.transcriptWarnings).toEqual([]);
		expect(request.localAnalysis.clicks).toBeGreaterThanOrEqual(1);
		expect(request.localAnalysis.zooms).toBeGreaterThanOrEqual(1);
		expect(request.localAnalysis.steps.length).toBeGreaterThanOrEqual(1);
	});

	it("skips frame sampling when vision mode is disabled", async () => {
		const sampleFrames = vi.fn(async () => [
			{
				timestampMs: 100,
				mimeType: "image/jpeg" as const,
				dataUrl: "data:image/jpeg;base64,abc",
			},
		]);

		const request = await buildSmartDemoAIRequest({
			config: {
				provider: "ollama",
				model: "llama3.2",
				enabled: true,
				hasKey: false,
				useVision: false,
			},
			cursorTelemetry: [],
			durationMs: 1000,
			userPrompt: "",
			transcriptSegments: [],
			videoElement: {} as HTMLVideoElement,
			sampleFrames,
		});

		expect(request.sampledFrames).toEqual([]);
		expect(request.transcriptSegments).toEqual([]);
		expect(request.speechWindows).toEqual([]);
		expect(request.localAnalysis.transcriptWarnings).toEqual([]);
		expect(request.localAnalysis.speechAnchors).toEqual([]);
		expect(request.localAnalysis.narrationLinkedZooms).toEqual([]);
		expect(request.localAnalysis.focusMoments).toEqual([]);
		expect(sampleFrames).not.toHaveBeenCalled();
	});
});
