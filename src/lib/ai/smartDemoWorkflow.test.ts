import { runSpeechGroundedSmartDemoWorkflow } from "./smartDemoWorkflow";

describe("runSpeechGroundedSmartDemoWorkflow", () => {
	it("runs transcript parse, local grounding, AI analysis, and apply mapping as one workflow", async () => {
		const aiAnalyze = vi.fn(async (request) => ({
			summary: `Processed ${request.transcriptSegments.length} transcript segments`,
			steps: [],
			zooms: [],
			trims: [],
			speechAnchors: request.localAnalysis.speechAnchors,
			narrationLinkedZooms: request.localAnalysis.narrationLinkedZooms,
			focusMoments: request.localAnalysis.focusMoments,
		}));

		const result = await runSpeechGroundedSmartDemoWorkflow({
			config: {
				provider: "openai",
				model: "gpt-5-mini",
				enabled: true,
				hasKey: true,
				useVision: false,
			},
			cursorTelemetry: [{ timeMs: 1100, cx: 0.25, cy: 0.75 }],
			durationMs: 5000,
			userPrompt: "Turn this into a guided demo",
			transcriptContent: "[00:01.000] Click this button",
			transcriptFileName: "demo.txt",
			videoElement: {} as HTMLVideoElement,
			aiAnalyze,
			sampleFrames: vi.fn(async () => []),
		});

		expect(result.request.transcriptSegments).toHaveLength(1);
		expect(result.request.localAnalysis.speechAnchors).toHaveLength(1);
		expect(result.suggestion.narrationLinkedZooms).toHaveLength(1);
		expect(result.applied.zoomRegions).toHaveLength(1);
		expect(result.warnings).toEqual([]);
		expect(aiAnalyze).toHaveBeenCalledTimes(1);
	});
});
