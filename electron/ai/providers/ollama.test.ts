import { OllamaProvider } from "./ollama";

describe("OllamaProvider", () => {
	it("sends a text-only request when vision is disabled", async () => {
		const fetchImpl = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						message: {
							content: JSON.stringify({
								summary: "Text-only summary",
								steps: [],
								zooms: [],
								trims: [],
								speechAnchors: [],
								narrationLinkedZooms: [],
								focusMoments: [],
							}),
						},
					}),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				),
		);

		const provider = new OllamaProvider(fetchImpl);
		await provider.analyzeSmartDemo(
			{
				provider: "ollama",
				model: "llama3.2",
				enabled: true,
				useVision: false,
			},
			{
				provider: "ollama",
				model: "llama3.2",
				userPrompt: "",
				durationMs: 1000,
				sampledFrames: [
					{
						timestampMs: 100,
						mimeType: "image/jpeg",
						dataUrl: "data:image/jpeg;base64,abc",
					},
				],
				transcriptSegments: [],
				speechWindows: [],
				localAnalysis: {
					steps: [],
					clicks: 0,
					silences: 0,
					zooms: 0,
				},
			},
		);

		const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
		expect(body.messages[1].images).toBeUndefined();
	});

	it("includes images when vision is enabled", async () => {
		const fetchImpl = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						message: {
							content: JSON.stringify({
								summary: "Vision summary",
								steps: [],
								zooms: [],
								trims: [],
								speechAnchors: [],
								narrationLinkedZooms: [],
								focusMoments: [],
							}),
						},
					}),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				),
		);

		const provider = new OllamaProvider(fetchImpl);
		await provider.analyzeSmartDemo(
			{
				provider: "ollama",
				model: "llava",
				enabled: true,
				useVision: true,
			},
			{
				provider: "ollama",
				model: "llava",
				userPrompt: "",
				durationMs: 1000,
				sampledFrames: [
					{
						timestampMs: 100,
						mimeType: "image/jpeg",
						dataUrl: "data:image/jpeg;base64,abc",
					},
				],
				transcriptSegments: [],
				speechWindows: [],
				localAnalysis: {
					steps: [],
					clicks: 0,
					silences: 0,
					zooms: 0,
				},
			},
		);

		const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
		expect(body.messages[1].images).toEqual(["abc"]);
	});
});
